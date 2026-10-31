import {randomBytes} from 'node:crypto';
import * as database from '../storage.js';
export const reportSQL='SELECT sessions.*,users.name AS staff,devices.name AS device FROM sessions JOIN users ON users.id=approved_by JOIN devices ON devices.id=device_id ORDER BY sessions.start DESC,sessions.id DESC LIMIT 5000';
export const supportedActions=new Set(['request','approve','extend','stop','pay','reject']);
const toolError=message=>Object.assign(new Error(message),{expose:true});
const bill=s=>(s.end-s.start)/3600000*s.rate;
export function periodStart(period,time=Date.now()){
 const date=new Date(time+18000000);let day=date.getUTCDate();if(period==='week')day-=6;if(period==='month')day=1;
 return Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),day)-18000000;
}
export function createZoneTools({db=database,clock=()=>Date.now()}={}){
 const active=id=>db.get('SELECT * FROM sessions WHERE device_id=? AND stopped IS NULL AND end>?',id,clock());
 async function prepare(args,user){
  const action=args.action;if(!supportedActions.has(action))throw toolError('Action supported nahi.');if(action==='pay'&&user.role!=='owner')throw toolError('Payment marking sirf owner kar sakta hai.');
  let payload,summary;
  if(action==='request'){
   const device=Number(args.device),minutes=Number(args.minutes),customer=String(args.customer||'').trim();
   if(!Number.isInteger(device)||!Number.isInteger(minutes)||minutes<5||minutes>720||!customer||customer.length>80)throw toolError('Valid station, customer name aur 5–720 minutes chahiye.');
   const d=await db.get('SELECT * FROM devices WHERE id=?',device);if(!d||d.archived)throw toolError('Active station nahi mila.');if(await active(device))throw toolError('Station busy hai. Doosra PC choose karein.');
   payload={device,minutes,customer};summary=`${d.name}: ${customer}, ${minutes} minutes, Rs ${Math.round(minutes/60*d.rate)}. Sirf pending request banegi; PC abhi start nahi hoga.`;
  }else if(action==='approve'||action==='reject'){
   const r=await db.get("SELECT * FROM requests WHERE id=? AND status='pending'",Number(args.id));if(!r)throw toolError('Pending request nahi mili.');
   const d=await db.get('SELECT * FROM devices WHERE id=?',r.device_id);payload={id:r.id};summary=`${action==='approve'?'Approve & START':'Reject'}: ${d.name}, ${r.customer}, ${r.minutes} minutes, Rs ${Math.round(r.minutes/60*d.rate)}.`;
  }else{
   const s=await db.get('SELECT * FROM sessions WHERE id=?',Number(args.id));if(!s)throw toolError('Session nahi mila.');
   const d=await db.get('SELECT * FROM devices WHERE id=?',s.device_id);payload={id:s.id};
   if(action==='extend'){
    const minutes=Number(args.minutes);if(!Number.isInteger(minutes)||minutes<5||minutes>720||s.stopped!==null)throw toolError('5–720 extra minutes aur continuable session chahiye.');
    payload={id:s.id,minutes,expectedEnd:s.end};summary=`${d.name}: ${s.customer}, +${minutes} minutes, Rs ${Math.round(minutes/60*s.rate)} extra. Agent ko time receive hona zaroori hai.`;
   }else if(action==='pay')summary=`${d.name}: ${s.customer}. Rs ${Math.round(Math.max(0,bill(s)-(s.paid_amount||0)))} balance ko received mark karein. Pehle asli payment check karein.`;
   else{if(s.stopped!==null||s.end<=clock())throw toolError('Active session nahi mila.');summary=`STOP ${d.name}: ${s.customer}. Full booked bill retained rahega.`;}
  }
  const id=randomBytes(24).toString('hex'),expires=clock()+300000;
  await db.tx(async()=>{
   await db.run('INSERT INTO assistant_actions(id,user_id,action,payload,expires,consumed) VALUES(?,?,?,?,?,?)',id,user.id,action,JSON.stringify(payload),expires,0);
   await db.run('INSERT INTO audit(time,actor,action) VALUES(?,?,?)',clock(),user.name,`AI prepared ${action}; staff confirmation pending`);
  });
  return {id,action,summary,expires};
 }
 return async function execute(name,args,user){
  if(name==='zone_overview'){
   const devices=(await db.all('SELECT * FROM devices ORDER BY id')).filter(d=>!d.archived);
   return {stations:await Promise.all(devices.map(async d=>{const s=await active(d.id);return {id:d.id,name:d.name,kind:d.kind,rate:d.rate,status:s?'busy':'available',session:s?{id:s.id,customer:s.customer,end:s.end,minutesLeft:Math.max(0,Math.ceil((s.end-clock())/60000))}:null};})),pendingRequests:(await db.all("SELECT * FROM requests WHERE status='pending' ORDER BY id DESC")).slice(0,30),note:'Availability is booking status. Native Windows enforcement remains unverified; PS5 physical control is not implemented.'};
  }
  if(name==='usage_report'){
   if(!['today','week','month'].includes(args.period))throw toolError('Period today, week ya month hona chahiye.');
   const all=await db.all(reportSQL),start=periodStart(args.period,clock()),booked=all.filter(s=>s.start>=start),now=clock();
   const totals={bookedValue:0,recordedReceived:0,bookedHours:0,elapsedHours:0};const stations={};
   for(const s of all){const elapsed=Math.max(0,Math.min(now,s.end,s.stopped??Infinity)-Math.max(start,s.start))/3600000;totals.elapsedHours+=elapsed;if(s.start<start)continue;
    const value=bill(s),hours=(s.end-s.start)/3600000;totals.bookedValue+=value;totals.recordedReceived+=s.paid_amount||0;totals.bookedHours+=hours;
    const d=stations[s.device]||{bookedHours:0,bookedValue:0};d.bookedHours+=hours;d.bookedValue+=value;stations[s.device]=d;
   }
   return {period:args.period,timeZone:'Asia/Karachi',totals,stations,sessionCount:booked.length,historyMayBeTruncated:all.length===5000,note:'Payment is manually marked against sessions starting in the period, not a bank/cash audit or payment-date report. Elapsed time is session time, not physical playtime.'};
  }
  if(name==='customer_history'){
   const query=String(args.name||'').trim();if(!query||query.length>80)throw toolError('Customer ka naam chahiye.');
   const rows=await db.all(reportSQL);return {sessions:rows.filter(s=>s.customer.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0,20).map(s=>({id:s.id,customer:s.customer,device:s.device,start:s.start,end:s.end,stopped:s.stopped,bill:bill(s),received:s.paid_amount||0})),historyMayBeTruncated:rows.length===5000};
  }
  if(name==='activity_log'){if(user.role!=='owner')throw toolError('Audit log owner-only hai.');return {entries:(await db.all('SELECT * FROM audit ORDER BY id DESC LIMIT 100')).slice(0,20)};}
  if(name==='prepare_action')return {confirmationRequired:true,card:await prepare(args,user)};
  throw toolError('Tool allowed nahi hai.');
 };
}
export const zoneTools=createZoneTools();
