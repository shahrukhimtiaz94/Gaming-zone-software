import test from 'node:test';
import assert from 'node:assert/strict';
import {readApiResponse} from '../public/api-response.js';
test('platform text and HTML failures produce safe errors instead of JSON parser crashes',async()=>{
 for(const [status,body] of [[500,'A server error has occurred secret'],[504,'<html>timeout</html>'],[200,'null']]){
  await assert.rejects(readApiResponse(new Response(body,{status})),e=>{assert.ok(['SERVER_RESPONSE_INVALID','SERVER_TIMEOUT'].includes(e.code));assert.ok(!e.message.includes('secret'));return true;});
 }
 assert.deepEqual(await readApiResponse(new Response('{"ok":true}')),{ok:true});
 await assert.rejects(readApiResponse(new Response('{"error":"Busy","code":"BUSY","reference":"abc"}',{status:503})),e=>e.code==='BUSY'&&e.message.includes('Ref: abc'));
});
