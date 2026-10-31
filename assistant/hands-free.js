import {randomBytes} from 'node:crypto';
import * as database from '../storage.js';
const failure=(message,status=403)=>Object.assign(new Error(message),{status,expose:true});
export function createHandsFree({db=database,clock=()=>Date.now()}={}){
 async function read(id,user,sessionHash){
  if(typeof id!=='string'||!/^[a-f0-9]{48}$/.test(id))return null;
  const row=await db.get('SELECT * FROM assistant_actions WHERE id=?',id);
  if(!row||row.action!=='handsfree_booking'||row.user_id!==user.id||row.consumed||row.expires<=clock())return null;
  try{if(JSON.parse(row.payload).sessionHash!==sessionHash)return null;}catch{return null;}
  return row;
 }
 async function control(mode,id,user,sessionHash){
  if(!['owner','staff'].includes(user.role))throw failure('Staff login chahiye.');
  return db.tx(async()=>{
   if(mode==='enable'){
    const lease=randomBytes(24).toString('hex'),expires=clock()+60000;
    await db.run('INSERT INTO assistant_actions(id,user_id,action,payload,expires,consumed) VALUES(?,?,?,?,?,?)',lease,user.id,'handsfree_booking',JSON.stringify({sessionHash}),expires,0);
    await db.run('INSERT INTO audit(time,actor,action) VALUES(?,?,?)',clock(),user.name,'Hands-free PC auto-booking enabled for this login/tab');
    return {lease,expires};
   }
   const row=await read(id,user,sessionHash);
   if(mode==='disable'){
    if(row){await db.run('UPDATE assistant_actions SET consumed=1 WHERE id=?',row.id);await db.run('INSERT INTO audit(time,actor,action) VALUES(?,?,?)',clock(),user.name,'Hands-free PC auto-booking disabled');}
    return {disabled:true};
   }
   if(mode!=='renew'||!row)throw failure('Hands-free permission expire/off ho gayi. Dobara enable karein.');
   const expires=clock()+60000;await db.run('UPDATE assistant_actions SET expires=? WHERE id=?',expires,row.id);return {lease:row.id,expires};
  });
 }
 async function book(id,user,sessionHash,args,{cancelled=()=>false,sessionValid=async()=>true}={}){
  return db.tx(async()=>{
   const grant=await read(id,user,sessionHash);
   if(cancelled()||!(await sessionValid())||!grant)throw failure('Hands-free off/expired hai. Auto-booking nahi ho sakti.');
   const device=Number(args.device),minutes=Number(args.minutes),customer=String(args.customer||'').trim();
   if(!Number.isInteger(device)||!Number.isInteger(minutes)||minutes<5||minutes>720||!customer||customer.length>80)throw failure('PC number, customer naam aur 5–720 minutes chahiye.',400);
   const d=await db.get("SELECT * FROM devices WHERE id=? AND kind='PC'",device);if(!d||d.archived)throw failure('Auto-booking sirf active PCs ke liye hai.',400);
   if(await db.get('SELECT * FROM sessions WHERE device_id=? AND stopped IS NULL AND end>?',device,clock()))throw failure('PC busy hai. Doosra PC batayein.',409);
   if(cancelled())throw failure('Request cancel ho gayi.');
   const start=clock(),end=start+minutes*60000;
   const request=await db.run("INSERT INTO requests(device_id,customer,minutes,status,created) VALUES(?,?,?,'approved',?)",device,customer,minutes,start);
   const session=await db.run('INSERT INTO sessions(device_id,customer,start,end,rate,approved_by) VALUES(?,?,?,?,?,?)',device,customer,start,end,d.rate,user.id);
   await db.run('INSERT INTO audit(time,actor,action) VALUES(?,?,?)',start,user.name,`Hands-free AUTO START ${d.name}: ${customer}, ${minutes} min, Rs ${Math.round(minutes/60*d.rate)}`);
   if(cancelled()||grant.expires<=clock())throw failure('Request cancel ya hands-free permission expire ho gayi.');
   return {executed:true,booking:{deviceId:device,device:d.name,customer,minutes,bill:Math.round(minutes/60*d.rate),sessionId:Number(session.lastInsertRowid),requestId:Number(request.lastInsertRowid),start,end,deviceDelivery:'pending'}};
  });
 }
 return {read,control,book};
}
export const handsFree=createHandsFree();
