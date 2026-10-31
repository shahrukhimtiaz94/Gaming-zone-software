import {test} from 'node:test';
import assert from 'node:assert/strict';
import {withIndexFallback,boundedIndexFallback} from '../firebase/index-fallback.js';
import {describeError,indexConsoleLink,safeErrorLocation} from '../errors.js';

test('missing composite index uses fallback; healthy query avoids unnecessary reads',async()=>{
 let calls=0;
 const missing=Object.assign(new Error('The query requires an index. https://console.firebase.google.com/project/demo/firestore/indexes?create_composite=example'),{code:9});
 const rows={docs:[{id:'existing-booking'}]};
 assert.equal(await withIndexFallback(async()=>{throw missing;},async()=>{calls++;return rows;}),rows);
 assert.equal(calls,1);
 assert.equal(await withIndexFallback(async()=>rows,async()=>{throw Error('Unexpected extra read');}),rows);
 assert.equal(indexConsoleLink(missing),'https://console.firebase.google.com/project/demo/firestore/indexes?create_composite=example');
 assert.equal(describeError(missing).code,'FIRESTORE_INDEX_REQUIRED');
});
test('fallback never masks credentials, network or unrelated precondition failures',async()=>{
 for(const error of [Object.assign(new Error('Permission denied'),{code:7}),Object.assign(new Error('Network unavailable'),{code:14}),Object.assign(new Error('Other prerequisite missing'),{code:9})]){
  await assert.rejects(withIndexFallback(async()=>{throw error;},async()=>{throw Error('Wrong fallback');}),e=>e===error);
 }
 assert.equal(describeError({code:7}).code,'FIREBASE_ACCESS_DENIED');
 const unsafe=Object.assign(new Error('private-key-value must never reach the browser'),{code:14});
 assert.ok(!JSON.stringify(describeError(unsafe)).includes('private-key-value'));
 assert.equal(indexConsoleLink(unsafe),undefined);
 assert.ok(!JSON.stringify(describeError({status:503,message:'private-key-value'})).includes('private-key-value'));
 assert.equal(describeError({status:400,expose:true,message:'Valid customer name required'}).error,'Valid customer name required');
});
test('fallback refuses oversized history instead of omitting a possible active session',()=>{
 const rows={docs:new Array(5001)};
 assert.throws(()=>boundedIndexFallback(rows),e=>e.code==='FIRESTORE_INDEX_REQUIRED');
 const valid={docs:[]};assert.equal(boundedIndexFallback(valid),valid);
});

test('Firestore quota, contention and transient failures are actionable without exposing raw data',()=>{
 assert.equal(describeError({code:8,message:'quota with SECRET'}).code,'FIREBASE_QUOTA_EXCEEDED');
 assert.equal(describeError({code:10}).code,'FIREBASE_TRANSACTION_BUSY');
 for(const code of [4,14])assert.equal(describeError({code}).code,'FIREBASE_TEMPORARILY_UNAVAILABLE');
 assert.equal(describeError(new Error('Unsupported Firestore mutation')).code,'FIREBASE_QUERY_UNSUPPORTED');
 const e=new Error('SECRET');e.stack='Error: SECRET\n at run (file:///workspace/app/assistant/devices.js:42:12)';assert.equal(safeErrorLocation(e),'assistant/devices.js:42:12');assert.ok(!JSON.stringify(describeError({code:8,message:'SECRET'})).includes('SECRET'));
});
