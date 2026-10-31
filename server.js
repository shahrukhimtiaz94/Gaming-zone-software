import http from 'node:http';
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { get, all, run, tx, ready } from './storage.js';
import { describeError, indexConsoleLink } from './errors.js';
import { synthesizeUrdu } from './firebase/speech.js';
import {createAgent,createGeminiClient} from './assistant/gemini.js';
import {zoneTools,supportedActions} from './assistant/tools.js';
const chatAgent=createAgent({generate:createGeminiClient(),execute:zoneTools});
const root=fileURLToPath(new URL('.',import.meta.url));
const now=()=>Date.now();
const log=(actor,action)=>run('INSERT INTO audit(time,actor,action) VALUES(?,?,?)',now(),actor,action);
const active=id=>get('SELECT * FROM sessions WHERE device_id=? AND stopped IS NULL AND end>?',id,now());
function respond(res,status,obj){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));}
function fail(message,status=400){throw Object.assign(new Error(message),{status,expose:true});}
function user(req){const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('zone='))?.slice(5);return get('SELECT users.* FROM tokens JOIN users ON users.id=tokens.user_id WHERE token=? AND expires>?',token||'',now());}
async function credentials(name,password,role){const salt=randomBytes(16).toString('hex');await run('INSERT INTO users(name,role,salt,hash) VALUES(?,?,?,?)',name,role,salt,scryptSync(password,salt,64).toString('hex'));}
function validatePassword(p){if(typeof p!=='string'||p.length<12||p.length>200)fail('Password kam az kam 12 characters ka rakhein.');}
const secureCookie=()=>process.env.COOKIE_SECURE==='1'||Boolean(process.env.VERCEL)?'; Secure':'';

export default async function handler(req,res){try{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');
const url=new URL(req.url,'http://localhost');
if(!url.pathname.startsWith('/api/')){const file={'/':'index.html','/app.js':'app.js','/voice.js':'voice.js','/ai-agent.js':'ai-agent.js','/voice-dialogue.js':'voice-dialogue.js','/style.css':'style.css'}[url.pathname];if(!file){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');return res.end(readFileSync(`${root}public/${file}`));}
let body={};
if(req.method==='POST'){
 if(req.headers.origin&&req.headers.origin!==`${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`)fail('Invalid origin',403);
 // Vercel may supply an already-parsed body; the standalone Node server supplies a stream.
 if(req.body!==undefined){try{body=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{fail('Invalid JSON');}if(JSON.stringify(body).length>10000)fail('Request too large',413);}
 else{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>10000)fail('Request too large',413);}try{body=JSON.parse(raw||'{}');}catch{fail('Invalid JSON');}}
 if(!body||typeof body!=='object'||Array.isArray(body))fail('JSON object required');
}
await ready();
const route=url.pathname==='/api/index'?'/api/'+(url.searchParams.get('route')||(typeof req.query?.route==='string'?req.query.route:'')):url.pathname;
if(route==='/api/status'){
 const u=await user(req);
 return respond(res,200,{setup:!(await get('SELECT id FROM users LIMIT 1')),user:u?{name:u.name,role:u.role}:null});
}
if(route==='/api/setup'&&req.method==='POST'){
 await tx(async()=>{
  if(await get('SELECT id FROM users LIMIT 1'))fail('Setup complete',403);
  if(!process.env.SETUP_KEY||body.key!==process.env.SETUP_KEY)fail('Server ka SETUP_KEY chahiye.',403);
  validatePassword(body.password);const name=String(body.name||'').trim();if(!name||name.length>80)fail('Valid naam chahiye');
  await credentials(name,body.password,'owner');await log(name,'Owner account created');
 });return respond(res,200,{ok:true});
}
if(route==='/api/login'&&req.method==='POST'){
 // Durable limiter shared across Vercel instances. Identity is server/platform supplied.
 const ip=process.env.VERCEL?(req.headers['x-vercel-forwarded-for']||req.socket?.remoteAddress||'unknown'):(req.socket?.remoteAddress||'unknown');
 const identity=createHash('sha256').update(String(ip)).digest('hex');
 const count=await tx(async()=>{
  let a=await get('SELECT * FROM login_attempts WHERE identity=?',identity);
  if(!a){await run('INSERT INTO login_attempts(identity,attempts,window_start) VALUES(?,?,?)',identity,1,now());return 1;}
  if(now()-a.window_start>600000){await run('UPDATE login_attempts SET attempts=1,window_start=? WHERE identity=?',now(),identity);return 1;}
  await run('UPDATE login_attempts SET attempts=attempts+1 WHERE identity=?',identity);return a.attempts+1;
 });
 if(count>30)fail('10 minutes baad dobara koshish karein',429);
 const u=await get('SELECT * FROM users WHERE name=?',String(body.name));
 const hash=scryptSync(String(body.password||'').slice(0,200),u?.salt||'dummy',64);
 if(!u||!timingSafeEqual(hash,Buffer.from(u.hash,'hex')))fail('Naam ya password ghalat hai',401);
 const token=randomBytes(32).toString('hex');await run('INSERT INTO tokens(token,user_id,expires) VALUES(?,?,?)',token,u.id,now()+43200000);
 res.setHeader('Set-Cookie',`zone=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie()}`);return respond(res,200,{ok:true});
}
if(route==='/api/agent/poll'&&req.method==='POST'){
 const token=(req.headers.authorization||'').match(/^Bearer ([a-f0-9]{64})$/)?.[1];if(!token)fail('Device authentication required',401);
 const a=await get('SELECT * FROM agents WHERE key_hash=?',createHash('sha256').update(token).digest('hex'));if(!a)fail('Device key invalid or revoked',401);
 const reported=['blocked','enabled','error'].includes(body.state)?body.state:'error';
 await run('UPDATE agents SET last_seen=?,state=?,version=?,session_id=?,session_end=? WHERE device_id=? AND key_hash=?',now(),reported,String(body.version||'').slice(0,40),Number.isSafeInteger(body.sessionId)?body.sessionId:null,Number.isSafeInteger(body.sessionEnd)?body.sessionEnd:null,a.device_id,a.key_hash);
 if(a.state!==reported)await log(`Agent PC ${a.device_id}`,`Reported state: ${reported}`);
 const session=await active(a.device_id);
 // Key may have been rotated/revoked while awaiting a database query.
 if(!(await get('SELECT device_id FROM agents WHERE device_id=? AND key_hash=?',a.device_id,a.key_hash)))fail('Device key revoked',401);
 return respond(res,200,{device:a.device_id,serverTime:now(),session:session?{id:session.id,end:session.end,remainingMs:Math.max(0,session.end-now())}:null});
}
const u=await user(req);if(!u)fail('Login karein',401);
if(route==='/api/logout'&&req.method==='POST'){
 const token=(req.headers.cookie||'').match(/(?:^|;\s*)zone=([^;]+)/)?.[1];await run('DELETE FROM tokens WHERE token=?',token||'');
 res.setHeader('Set-Cookie',`zone=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie()}`);return respond(res,200,{ok:true});
}
if(route==='/api/state'){
 const devices=await all('SELECT * FROM devices ORDER BY id');
 const snapshots=await Promise.all(devices.map(async d=>{
  const a=await get('SELECT last_seen,state,version,session_id,session_end FROM agents WHERE device_id=?',d.id);
  return {...d,session:(await active(d.id))||null,agent:a?{...a,online:a.last_seen!=null&&now()-a.last_seen<20000}:null};
 }));
 return respond(res,200,{devices:snapshots,requests:await all("SELECT * FROM requests WHERE status='pending' ORDER BY id DESC"),sessions:await all('SELECT sessions.*,users.name AS staff,devices.name AS device FROM sessions JOIN users ON users.id=approved_by JOIN devices ON devices.id=device_id ORDER BY sessions.start DESC,sessions.id DESC LIMIT 5000'),audit:u.role==='owner'?await all('SELECT * FROM audit ORDER BY id DESC LIMIT 100'):[]});
}
if(req.method!=='POST')fail('Not found',404);
if(route==='/api/assistant/chat'){
 if(!process.env.GEMINI_API_KEY)throw Object.assign(new Error('Real AI agent ke liye Vercel mein GEMINI_API_KEY securely add karein. Key chat mein share na karein.'),{status:503,expose:true,code:'AI_NOT_CONFIGURED'});
 if(typeof body.message!=='string'||body.message.length>1200||!body.message.trim())fail('AI sawal 1–1200 characters rakhein');
 await tx(async()=>{
  const identity=`assistant:${u.id}`,a=await get('SELECT * FROM login_attempts WHERE identity=?',identity);
  if(!a){await run('INSERT INTO login_attempts(identity,attempts,window_start) VALUES(?,?,?)',identity,1,now());return;}
  if(now()-a.window_start>600000){await run('UPDATE login_attempts SET attempts=1,window_start=? WHERE identity=?',now(),identity);return;}
  if(a.attempts>=30)fail('AI limit poori ho gayi. 10 minutes baad try karein; manual dashboard available hai.',429);
  await run('UPDATE login_attempts SET attempts=attempts+1 WHERE identity=?',identity);
 });
 return respond(res,200,await chatAgent({message:body.message,history:body.history||[],user:{id:u.id,name:u.name,role:u.role}}));
}
if(route==='/api/assistant/confirm'){
 if(typeof body.id!=='string'||!/^[a-f0-9]{48}$/.test(body.id))fail('Action ID valid nahi',400);
 const result=await tx(async()=>{
  const proposed=await get('SELECT * FROM assistant_actions WHERE id=?',body.id);
  if(!proposed||proposed.user_id!==u.id)fail('Action aapke account ki nahi ya available nahi',403);
  if(proposed.consumed||proposed.expires<=now())fail('Action expire ya pehle apply ho chuki. AI se naya action poochein.',409);
  if(!supportedActions.has(proposed.action))fail('Action allowed nahi',403);
  if(proposed.action==='pay'&&u.role!=='owner')fail('Owner only',403);
  let status=0,captured;
  await handler({url:'/api/'+proposed.action,method:'POST',headers:req.headers,socket:req.socket,body:JSON.parse(proposed.payload)}, {setHeader(){},writeHead(code){status=code;},end(text){captured=JSON.parse(text);}});
  if(status<200||status>=300)throw Object.assign(new Error(captured?.error||'Action failed'),{status:status||503,expose:true});
  await run('UPDATE assistant_actions SET consumed=1 WHERE id=?',proposed.id);
  await log(u.name,`AI action confirmed by staff button: ${proposed.action}`);
  return {ok:true,action:proposed.action,result:captured,message:proposed.action==='request'?'Pending booking request save ho gayi. Staff approval abhi baqi hai.':'Action server par apply ho gayi. Dashboard status check karein; device delivery alag hai.'};
 });
 return respond(res,200,result);
}
if(route==='/api/voice/speak'){
 if(process.env.VOICE_PROVIDER!=='google')throw Object.assign(new Error('Natural Urdu female voice ke liye Google Text-to-Speech API aur VOICE_PROVIDER=google configure karein.'),{status:503,expose:true,code:'TTS_NOT_CONFIGURED'});
 if(typeof body.text!=='string'||!body.text.trim()||Buffer.byteLength(body.text,'utf8')>4000)fail('Voice text 1 se 4000 bytes rakhein');
 await tx(async()=>{
  const identity=`voice:${u.id}`,a=await get('SELECT * FROM login_attempts WHERE identity=?',identity);
  if(!a){await run('INSERT INTO login_attempts(identity,attempts,window_start) VALUES(?,?,?)',identity,1,now());return;}
  if(now()-a.window_start>600000){await run('UPDATE login_attempts SET attempts=1,window_start=? WHERE identity=?',now(),identity);return;}
  if(a.attempts>=60)fail('Voice request limit poori ho gayi. 10 minutes baad try karein ya browser voice use karein.',429);
  await run('UPDATE login_attempts SET attempts=attempts+1 WHERE identity=?',identity);
 });
 return respond(res,200,await synthesizeUrdu(body.text));
}
if(route==='/api/device-key'){
 if(u.role!=='owner')fail('Owner only',403);
 const result=await tx(async()=>{
  const d=await get("SELECT * FROM devices WHERE id=? AND kind='PC'",Number(body.device));if(!d)fail('Windows PC required');
  if(body.revoke===true){await run('DELETE FROM agents WHERE device_id=?',d.id);await log(u.name,`${d.name}: agent key revoked`);return {ok:true};}
  const key=randomBytes(32).toString('hex');
  await run("INSERT INTO agents(device_id,key_hash,state) VALUES(?,?,'unpaired') ON CONFLICT(device_id) DO UPDATE SET key_hash=excluded.key_hash,last_seen=NULL,state='unpaired',version=NULL,session_id=NULL,session_end=NULL",d.id,createHash('sha256').update(key).digest('hex'));
  await log(u.name,`${d.name}: agent key issued / rotated`);return {key,device:d.id};
 });return respond(res,200,result);
}
if(route==='/api/request'){
 const d=await get('SELECT * FROM devices WHERE id=?',Number(body.device));if(!d)fail('Device nahi mila');
 const minutes=Number(body.minutes);if(!Number.isInteger(minutes)||minutes<5||minutes>720)fail('Duration 5 se 720 minutes rakhein');
 const customer=String(body.customer||'').trim();if(!customer||customer.length>80)fail('Customer naam 1–80 characters');
 await tx(async()=>{await run('INSERT INTO requests(device_id,customer,minutes,created) VALUES(?,?,?,?)',d.id,customer,minutes,now());await log(u.name,`${d.name}: ${customer}, ${minutes} min request`);});
}else if(route==='/api/approve'){
 await tx(async()=>{
  const r=await get("SELECT * FROM requests WHERE id=? AND status='pending'",Number(body.id));if(!r)fail('Request available nahi');if(await active(r.device_id))fail('Device busy hai',409);
  const d=await get('SELECT * FROM devices WHERE id=?',r.device_id),start=now();
  await run('INSERT INTO sessions(device_id,customer,start,end,rate,approved_by) VALUES(?,?,?,?,?,?)',d.id,r.customer,start,start+r.minutes*60000,d.rate,u.id);
  await run("UPDATE requests SET status='approved' WHERE id=?",r.id);await log(u.name,`${d.name}: approved ${r.customer}, ${r.minutes} min`);
 });
}else if(route==='/api/extend'){
 const minutes=Number(body.minutes);if(!Number.isInteger(minutes)||minutes<5||minutes>720)fail('Extra time 5 se 720 minutes rakhein');if(!Number.isSafeInteger(body.expectedEnd))fail('Session refresh karke dobara try karein');
 const id=await tx(async()=>{
  const s=await get('SELECT * FROM sessions WHERE id=?',Number(body.id));if(!s||s.stopped!==null)fail('Session ended manually; nayi booking banayein',409);if(s.end!==body.expectedEnd)fail('Time already changed; refresh karein',409);
  const latest=await get('SELECT id FROM sessions WHERE device_id=? ORDER BY start DESC,id DESC LIMIT 1',s.device_id);if(latest.id!==s.id)fail('Is PC par newer booking hai; purani session extend nahi ho sakti',409);
  const current=await active(s.device_id),time=now();if(current&&current.id!==s.id)fail('PC doosray session mein busy hai',409);
  let id=s.id;
  if(s.end>time){if(s.end+minutes*60000-s.start>43200000)fail('Ek session maximum 12 ghante; nayi booking banayein');await run('UPDATE sessions SET end=end+?,paid=0 WHERE id=?',minutes*60000,s.id);}
  else{const r=await run('INSERT INTO sessions(device_id,customer,start,end,rate,approved_by) VALUES(?,?,?,?,?,?)',s.device_id,s.customer,time,time+minutes*60000,s.rate,u.id);id=Number(r.lastInsertRowid);}
  await log(u.name,`Session ${s.id}: +${minutes} min approved; session ${id}. Agent confirmation pending.`);return id;
 });return respond(res,200,{ok:true,id,delivery:'pending',message:'Time saved. PC par apply hone ke liye agent ka server se connection zaroori hai.'});
}else if(route==='/api/reject'){
 await tx(async()=>{await run("UPDATE requests SET status='rejected' WHERE id=? AND status='pending'",Number(body.id));await log(u.name,`Request ${Number(body.id)} rejected`);});
}else if(route==='/api/stop'){
 await tx(async()=>{const s=await get('SELECT * FROM sessions WHERE id=?',Number(body.id));if(!s||s.stopped||s.end<=now())fail('Active session nahi mila');await run('UPDATE sessions SET stopped=? WHERE id=?',now(),s.id);await log(u.name,`Session ${s.id} stopped early; booked bill retained`);});
}else if(route==='/api/pay'){
 if(u.role!=='owner')fail('Owner approval required',403);
 await tx(async()=>{const s=await get('SELECT * FROM sessions WHERE id=?',Number(body.id));if(!s)fail('Session nahi mila');if(!s.paid){const total=(s.end-s.start)/3600000*s.rate,extra=total-s.paid_amount;await run('UPDATE sessions SET paid=1,paid_amount=? WHERE id=?',total,s.id);await log(u.name,`Session ${s.id}: payment received ${extra}; total received ${total}`);}});
}else if(route==='/api/staff'){
 if(u.role!=='owner')fail('Owner only',403);validatePassword(body.password);const name=String(body.name||'').trim();if(!name||name.length>80)fail('Valid naam chahiye');
 await tx(async()=>{if(await get('SELECT id FROM users WHERE name=?',name))fail('Ye naam pehle se use ho raha hai',409);await credentials(name,body.password,'staff');await log(u.name,`Staff account created: ${name}`);});
}else fail('Not found',404);
respond(res,200,{ok:true});
}catch(e){const problem=describeError(e);const reference=randomBytes(6).toString('hex');respond(res,problem.status,{error:problem.error,...(problem.code?{code:problem.code,reference}:{})});if(!e.expose||problem.status>=500)console.error('Request failed:',JSON.stringify({reference,code:e.code||e.name,route:new URL(req.url,'http://localhost').pathname,indexUrl:indexConsoleLink(e)}));}}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 await ready();
 http.createServer(handler).listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`Gaming Zone listening on port ${process.env.PORT||3000}`));
}
