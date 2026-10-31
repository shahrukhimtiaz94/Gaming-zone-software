import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const exec=promisify(execFile);

test('Vercel refuses ephemeral SQLite and accepts platform-parsed requests',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'zone-function-'));
 const env={...process.env,DATA_DIR:dir,SETUP_KEY:'test-only-key'};delete env.DATABASE_URL;delete env.VERCEL;delete env.DATABASE_PROVIDER;
 try{
  await assert.rejects(exec(process.execPath,['--input-type=module','-e',"await import('./storage.js')"],{env:{...env,VERCEL:'1'}}),e=>e.stderr.includes('DATABASE_URL is required on Vercel'));
  await exec(process.execPath,['--input-type=module','-e',`
   import assert from 'node:assert/strict';
   const {default:handler}=await import('./api/index.js');
   const call=async(route,method='GET',body)=>{let status;let headers={};let result;
    await handler({url:'/api/index',query:{route},method,body,headers:{host:'localhost'},socket:{}},{setHeader:(k,v)=>headers[k]=v,writeHead:(s)=>status=s,end:x=>result=JSON.parse(x)});
    return {status,headers,result};};
   assert.equal((await call('status')).result.setup,true);
   assert.equal((await call('setup','POST',{key:'test-only-key',name:'owner',password:'long-password-123'})).status,200);
   assert.equal((await call('login','POST','{')).status,400);
   const login=await call('login','POST',{name:'owner',password:'long-password-123'});
   assert.equal(login.status,200);assert.ok(login.headers['Set-Cookie'].includes('HttpOnly'));
   assert.equal((await call('state')).status,401);
  `],{env});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
