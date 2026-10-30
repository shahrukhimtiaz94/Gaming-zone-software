import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('upgrading existing databases preserves paid credit and adds agent acknowledgements', {timeout:15000}, async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zone-upgrade-'));
 const testEnv={...process.env};delete testEnv.DATABASE_URL;delete testEnv.VERCEL;
 let proc;
 try{
  const db=new DatabaseSync(join(dir,'zone.db'));
  db.exec(`CREATE TABLE sessions(id INTEGER PRIMARY KEY,device_id INTEGER,customer TEXT,start INTEGER,end INTEGER,stopped INTEGER,rate INTEGER,approved_by INTEGER,paid INTEGER DEFAULT 0);
   CREATE TABLE agents(device_id INTEGER PRIMARY KEY,key_hash TEXT NOT NULL,last_seen INTEGER,state TEXT,version TEXT);
   INSERT INTO sessions VALUES(1,1,'Existing paid customer',100000,3700000,NULL,300,1,1);
   INSERT INTO sessions VALUES(2,2,'Existing unpaid customer',100000,7300000,NULL,300,1,0);`);
  db.close();
  await new Promise((resolve,reject)=>{
   proc=spawn(process.execPath,['server.js'],{env:{...testEnv,DATA_DIR:dir,PORT:'0'}});
   proc.stdout.once('data',resolve);proc.once('error',reject);proc.once('exit',code=>reject(Error('Server exited '+code)));
  });
  const upgraded=new DatabaseSync(join(dir,'zone.db'));
  assert.equal(upgraded.prepare('SELECT paid_amount FROM sessions WHERE id=1').get().paid_amount,300);
  assert.equal(upgraded.prepare('SELECT paid_amount FROM sessions WHERE id=2').get().paid_amount,0);
  assert.ok(upgraded.prepare('PRAGMA table_info(agents)').all().some(c=>c.name==='session_end'));
  upgraded.close();
 }finally{
  if(proc&&!proc.killed)await new Promise(resolve=>{proc.once('exit',resolve);proc.kill();});
  rmSync(dir,{recursive:true,force:true});
 }
});
