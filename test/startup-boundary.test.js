import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
test('Vercel import-time database misconfiguration returns JSON rather than a platform crash',async()=>{
 const {stdout}=await promisify(execFile)(process.execPath,['--input-type=module','-e',`import handler from './api/index.js';let status,headers,body;await handler({url:'/api/status',headers:{}},{get headersSent(){return false},writeHead(s,h){status=s;headers=h},end(b){body=b}});console.log(JSON.stringify({status,headers,body:JSON.parse(body)}));`],{env:{...process.env,VERCEL:'1',DATABASE_PROVIDER:'',DATABASE_URL:''}});
 const result=JSON.parse(stdout);assert.equal(result.status,503);assert.equal(result.headers['Content-Type'],'application/json');assert.equal(result.body.code,'APP_STARTUP_FAILED');assert.match(result.body.reference,/^[a-f0-9]{12}$/);
});
