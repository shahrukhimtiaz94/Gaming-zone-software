import {test} from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import pg from 'pg';
import assert from 'node:assert/strict';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('authenticated booking, authorization, billing and durable history',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zone-test-')),port=18000+Math.floor(Math.random()*10000);
 const testEnv={...process.env};delete testEnv.DATABASE_URL;delete testEnv.VERCEL;delete testEnv.DATABASE_PROVIDER;
 const database=process.env.NEXUS_TEST_DATABASE_URL;
 const emulator=process.env.NEXUS_TEST_FIRESTORE_EMULATOR;
 if(database){const u=new URL(database);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.pathname,'/nexus_zone_test');testEnv.DATABASE_URL=database;const c=new pg.Client({connectionString:database});await c.connect();await c.query('DROP SCHEMA IF EXISTS nexus_zone CASCADE');await c.end();}
 if(emulator){assert.match(emulator,/^127\.0\.0\.1:\d+$/);assert.ok(!database,'Choose one test backend');testEnv.DATABASE_PROVIDER='firestore';testEnv.FIREBASE_PROJECT_ID='demo-nexus-zone-test';testEnv.FIRESTORE_EMULATOR_HOST=emulator;delete testEnv.GOOGLE_APPLICATION_CREDENTIALS;const r=await fetch(`http://${emulator}/emulator/v1/projects/demo-nexus-zone-test/databases/(default)/documents`,{method:'DELETE'});assert.equal(r.status,200);}
 let proc,indexFailures=0;
 if(process.env.NEXUS_TEST_MISSING_INDEX)assert.ok(emulator,'Index failure injection requires emulator');
 const start=()=>new Promise((resolve,reject)=>{proc=spawn(process.execPath,process.env.NEXUS_TEST_MISSING_INDEX?['--import','./scripts/missing-index-hook.mjs','server.js']:['server.js'],{env:{...testEnv,DATA_DIR:dir,PORT:String(port),SETUP_KEY:'test-only-key'}});proc.stderr.on('data',chunk=>{const line=chunk.toString();indexFailures+=(line.match(/TEST_MISSING_COMPOSITE_INDEX/g)||[]).length;if(!line.includes('ExperimentalWarning')&&!line.includes('TEST_MISSING_COMPOSITE_INDEX'))process.stderr.write(line);});proc.stdout.once('data',resolve);proc.once('error',reject);proc.once('exit',code=>reject(Error('Server exited '+code)));});
 const call=async(path,body,cookie,bearer)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${process.env.NEXUS_TEST_REWRITE?"index?route="+encodeURIComponent(path):path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{await start();assert.equal((await call('state')).status,401);assert.equal((await call('setup',{key:'wrong',name:'owner',password:'long-password-123'})).status,403);
 assert.equal((await call('setup',{key:'test-only-key',name:'owner',password:'long-password-123'})).status,200);
 const owner=(await call('login',{name:'owner',password:'long-password-123'})).cookie;assert.ok(owner);
 assert.equal((await call('staff',{name:'operator',password:'staff-password-123'},owner)).status,200);
 const staff=(await call('login',{name:'operator',password:'staff-password-123'})).cookie;
 assert.equal((await call('staff',{name:'intruder',password:'long-password-123'},staff)).status,403);
 assert.equal((await call('device-key',{device:1},staff)).status,403);
 assert.equal((await call('device-key',{device:11},owner)).status,400);
 assert.equal((await call('agent/poll',{state:'blocked'})).status,401);
 const key=(await call('device-key',{device:1},owner)).data.key;
 assert.match(key,/^[a-f0-9]{64}$/);
 let poll=(await call('agent/poll',{state:'blocked',version:'test'},null,key));
 assert.equal(poll.status,200);assert.equal(poll.data.device,1);assert.equal(poll.data.session,null);
 assert.equal((await call('state',null,owner)).data.devices[0].agent.online,true);
 assert.equal((await call('request',{device:1,customer:'Ahmed',minutes:60},staff)).status,200);
 let s=(await call('state',null,owner)).data;assert.equal(s.devices[0].session,null);assert.equal(s.requests.length,1);assert.equal((await call('agent/poll',{state:'blocked'},null,key)).data.session,null);
 assert.equal((await call('approve',{id:s.requests[0].id},staff)).status,200);
 s=(await call('state',null,owner)).data;assert.equal(s.devices[0].session.customer,'Ahmed');assert.equal(s.sessions.length,1);assert.equal(s.sessions[0].rate,300);
 poll=await call('agent/poll',{state:'enabled'},null,key);assert.equal(poll.data.session.id,s.sessions[0].id);assert.ok(poll.data.session.remainingMs>3590000&&poll.data.session.remainingMs<=3600000);
 assert.ok(!JSON.stringify(s).includes(key));
 const sessionId=s.sessions[0].id,originalEnd=s.sessions[0].end;
 assert.equal((await call('extend',{id:sessionId,minutes:60,expectedEnd:originalEnd})).status,401);
 assert.equal((await call('extend',{id:sessionId,minutes:60,expectedEnd:originalEnd},null,key)).status,401);
 assert.equal((await call('extend',{id:sessionId,minutes:-5,expectedEnd:originalEnd},staff)).status,400);
 assert.equal((await call('extend',{id:sessionId,minutes:60,expectedEnd:originalEnd},staff)).status,200);
 assert.equal((await call('extend',{id:sessionId,minutes:60,expectedEnd:originalEnd},staff)).status,409);
 poll=await call('agent/poll',{state:'enabled'},null,key);
 assert.equal(poll.data.session.end,originalEnd+3600000);
 assert.ok(poll.data.session.remainingMs>7190000);
 assert.equal((await call('extend',{id:sessionId,minutes:720,expectedEnd:poll.data.session.end},staff)).status,400);
 // Paid time must stay credited if staff approves additional time.
 await call('pay',{id:sessionId},owner);
 let paid=(await call('state',null,owner)).data.sessions[0];assert.equal(paid.paid_amount,600);
 await call('extend',{id:sessionId,minutes:60,expectedEnd:paid.end},staff);
 paid=(await call('state',null,owner)).data.sessions[0];assert.equal(paid.paid,0);assert.equal(paid.paid_amount,600);
 assert.equal((paid.end-paid.start)/3600000*paid.rate-paid.paid_amount,300);
 // Acknowledge that the device actually received the new end; saving alone is insufficient.
 await call('agent/poll',{state:'enabled',sessionId,sessionEnd:paid.end},null,key);
 assert.equal((await call('state',null,owner)).data.devices[0].agent.session_end,paid.end);

 assert.equal((await call('staff',{name:'no',password:'some-password-123'},null,key)).status,401);
 await call('request',{device:1,customer:'Ali',minutes:120},staff);s=(await call('state',null,owner)).data;
 assert.equal((await call('approve',{id:s.requests[0].id},staff)).status,409);
 assert.equal((await call('pay',{id:s.sessions[0].id},staff)).status,403);
 assert.equal((await call('pay',{id:s.sessions[0].id},owner)).status,200);
 assert.equal((await call('stop',{id:s.sessions[0].id},staff)).status,200);
 assert.equal((await call('state',null,owner)).data.devices[0].session,null);
 assert.equal((await call('agent/poll',{state:'blocked'},null,key)).data.session,null);
 assert.equal((await call('extend',{id:s.sessions[0].id,minutes:60,expectedEnd:s.sessions[0].end},staff)).status,409);
 // Expired continuation starts now, preserves old bill/payment and does not bill the locked gap.
 await call('request',{device:2,customer:'Continuing player',minutes:5},staff);
 let row=(await call('state',null,owner)).data.requests[0];await call('approve',{id:row.id},staff);
 let expired=(await call('state',null,owner)).data.sessions.find(x=>x.device_id===2);
 const end=Date.now()-60000;
 if(emulator){const r=await fetch(`http://${emulator}/v1/projects/demo-nexus-zone-test/databases/(default)/documents/nexus_zone/gaming-zone/sessions/${expired.id}?updateMask.fieldPaths=start&updateMask.fieldPaths=end`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:{start:{integerValue:String(end-300000)},end:{integerValue:String(end)}}})});assert.equal(r.status,200);}
 else if(database){const c=new pg.Client({connectionString:database});await c.connect();await c.query('UPDATE nexus_zone.sessions SET start=$1,"end"=$2 WHERE id=$3',[end-300000,end,expired.id]);await c.end();}
 else{const edit=new DatabaseSync(join(dir,'zone.db'));edit.prepare('UPDATE sessions SET start=?,end=? WHERE id=?').run(end-300000,end,expired.id);edit.close();}
 const continuation=await call('extend',{id:expired.id,minutes:60,expectedEnd:end},staff);
 assert.equal(continuation.status,200);
 let history=(await call('state',null,owner)).data.sessions;
 const resumed=history.find(x=>x.id===continuation.data.id);
 assert.equal(resumed.end-resumed.start,3600000);assert.ok(resumed.start>end);assert.equal(resumed.customer,'Continuing player');
 assert.equal(history.find(x=>x.id===expired.id).end,end);
 assert.equal((await call('extend',{id:expired.id,minutes:60,expectedEnd:end},staff)).status,409);
 const nextKey=(await call('device-key',{device:1},owner)).data.key;
 assert.equal((await call('agent/poll',{state:'enabled'},null,key)).status,401);
 assert.equal((await call('agent/poll',{state:'blocked'},null,nextKey)).status,200);
 await new Promise(resolve=>{proc.once('exit',resolve);proc.kill();});await start();
 assert.equal((await call('agent/poll',{state:'blocked'},null,nextKey)).status,200);
 assert.equal((await call('device-key',{device:1,revoke:true},owner)).status,200);
 assert.equal((await call('agent/poll',{state:'enabled'},null,nextKey)).status,401);
 s=(await call('state',null,owner)).data;assert.equal(s.sessions.find(x=>x.id===sessionId).paid,1);assert.ok(s.sessions.find(x=>x.id===sessionId).stopped);assert.ok(s.audit.length>=5);
 await call('request',{device:3,customer:'Player A',minutes:60},staff);await call('request',{device:3,customer:'Player B',minutes:60},staff);
 const competing=(await call('state',null,owner)).data.requests.filter(r=>r.device_id===3);
 const results=await Promise.all(competing.map(r=>call('approve',{id:r.id},staff)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 assert.equal((await call('state',null,owner)).data.sessions.filter(s=>s.device_id===3).length,1);
 // Prepare through the real server tool layer, then exercise one-use authenticated confirmations.
 const prepare=async(args,actor='owner')=>{const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',`import * as db from './storage.js';import {zoneTools} from './assistant/tools.js';await db.ready();const u=await db.get('SELECT * FROM users WHERE name=?',process.argv[2]);const r=await zoneTools('prepare_action',JSON.parse(process.argv[1]),u);process.stdout.write(JSON.stringify(r.card));`,JSON.stringify(args),actor],{env:{...testEnv,DATA_DIR:dir}});return JSON.parse(stdout);};
 const card=await prepare({action:'request',device:4,customer:'AI player',minutes:30});
 assert.equal((await call('state',null,owner)).data.requests.filter(r=>r.customer==='AI player').length,0,'Preparing must not create booking');
 assert.equal((await call('assistant/confirm',{id:card.id},staff)).status,403,'Card belongs to preparing account');
 assert.equal((await call('assistant/confirm',{id:card.id},owner)).status,200);
 assert.equal((await call('assistant/confirm',{id:card.id},owner)).status,409,'Confirmation cannot replay');
 const pending=(await call('state',null,owner)).data.requests.find(r=>r.customer==='AI player');assert.ok(pending);
 assert.equal((await call('state',null,owner)).data.devices[3].session,null,'Request still needs separate staff approval');
 const approval=await prepare({action:'approve',id:pending.id});assert.equal((await call('assistant/confirm',{id:approval.id},owner)).status,200);
 const aiSession=(await call('state',null,owner)).data.devices[3].session;assert.equal(aiSession.customer,'AI player');
 const extension=await prepare({action:'extend',id:aiSession.id,minutes:30});await call('extend',{id:aiSession.id,minutes:5,expectedEnd:aiSession.end},staff);
 assert.equal((await call('assistant/confirm',{id:extension.id},owner)).status,409,'Stale preview cannot overwrite updated time');
 assert.equal((await call('state',null,owner)).data.devices[3].session.end,aiSession.end+300000);
 await assert.rejects(prepare({action:'pay',id:aiSession.id},'operator'));
 if(process.env.NEXUS_TEST_MISSING_INDEX)assert.ok(indexFailures>=4,'Must actually exercise composite-index fallback');
 assert.equal((await call('logout',{},owner)).status,200);assert.equal((await call('state',null,owner)).status,401);
 }finally{if(proc&&!proc.killed)await new Promise(resolve=>{proc.once('exit',resolve);proc.kill();});rmSync(dir,{recursive:true,force:true});}
});
