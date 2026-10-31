import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc} from 'firebase/firestore';

test('Firestore rules reject direct browser access, including a Firebase-authenticated user', {skip:!process.env.NEXUS_TEST_FIRESTORE_EMULATOR},async()=>{
 const emulator=process.env.NEXUS_TEST_FIRESTORE_EMULATOR;
 assert.match(emulator,/^127\.0\.0\.1:\d+$/);
 const [host,port]=emulator.split(':');
 const env=await initializeTestEnvironment({projectId:'demo-nexus-zone-rules-test',firestore:{host,port:Number(port),rules:readFileSync('firestore.rules','utf8')}});
 try{
  const anon=env.unauthenticatedContext().firestore();
  const signed=env.authenticatedContext('customer').firestore();
  const path='nexus_zone/gaming-zone/devices/1';
  await assertFails(getDoc(doc(anon,path)));
  await assertFails(setDoc(doc(anon,path),{name:'Tampered PC'}));
  await assertFails(getDoc(doc(signed,path)));
  await assertFails(setDoc(doc(signed,path),{name:'Tampered PC'}));
 }finally{await env.cleanup();}
});
