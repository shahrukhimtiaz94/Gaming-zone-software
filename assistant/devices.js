import * as database from '../storage.js';
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status,expose:true});};
export function createDeviceSettings({db=database,clock=()=>Date.now()}={}){
 return async function manage(body,user){
  if(user.role!=='owner')fail('PC settings sirf owner change kar sakta hai.',403);
  return db.tx(async()=>{
   const rows=await db.all('SELECT * FROM devices ORDER BY id');const mode=body.mode;
   if(!['add','update','archive','restore'].includes(mode))fail('Device operation valid nahi.');
   let device=rows.find(d=>d.id===Number(body.id));
   if(mode!=='add'&&!device)fail('Device nahi mila.',404);
   if(mode==='archive'){
    if(await db.get('SELECT * FROM sessions WHERE device_id=? AND stopped IS NULL AND end>?',device.id,clock()))fail('Running session khatam kiye baghair PC remove nahi ho sakta.',409);
    if((await db.all("SELECT * FROM requests WHERE status='pending' ORDER BY id DESC")).some(r=>r.device_id===device.id))fail('Pehle is PC ki pending requests reject karein.',409);
    await db.run('UPDATE devices SET archived=1 WHERE id=?',device.id);
   }else{
    const name=String(mode==='restore'?device.name:body.name||'').trim();const rate=Number(mode==='restore'?device.rate:body.rate);const kind=mode==='add'?body.kind:device.kind;
    if(!name||name.length>40||!['PC','PS5'].includes(kind)||!Number.isInteger(rate)||rate<1||rate>100000)fail('Naam 1–40 characters, kind PC/PS5 aur rate Rs 1–100000/hour rakhein.');
    if(rows.some(d=>!d.archived&&d.id!==device?.id&&d.name.toLocaleLowerCase()===name.toLocaleLowerCase()))fail('Is naam ka station pehle se hai.',409);
    if(mode==='add'){
     if(rows.filter(d=>!d.archived).length>=100)fail('Maximum 100 active stations supported hain.');
     const id=Math.max(0,...rows.map(d=>d.id))+1;device={id,name,kind,rate,archived:0};await db.run('INSERT INTO devices(id,name,kind,rate,archived) VALUES(?,?,?,?,?)',id,name,kind,rate,0);
    }else{
     if(mode==='restore')await db.run('UPDATE devices SET archived=0 WHERE id=?',device.id);
     else await db.run('UPDATE devices SET name=?,rate=? WHERE id=?',name,rate,device.id);
    }
   }
   await db.run('INSERT INTO audit(time,actor,action) VALUES(?,?,?)',clock(),user.name,`Device settings ${mode}: ${device.name} (ID ${device.id})`);
   return {ok:true,id:device.id};
  });
 };
}
export const manageDevices=createDeviceSettings();
