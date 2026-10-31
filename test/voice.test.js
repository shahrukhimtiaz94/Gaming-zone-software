import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBookingSpeech,VoiceBookingDialogue} from '../public/voice-dialogue.js';
import {VoiceAssistant} from '../public/voice.js';
const devices=Array.from({length:12},(_,i)=>({id:i+1,name:i<10?`PC ${i+1}`:`PS5 ${i-9}`,kind:i<10?'PC':'PS5',rate:i<10?300:500,session:null}));

test('booking speech parses numeric, spoken and Urdu/Hindi station numbers and durations',()=>{
 for(const input of ['PC number five for two hours','PC 5 ko do ghante ke liye book karo','پی سی نمبر پانچ دو گھنٹے کے لیے بک کر دو','पीसी नंबर पांच दो घंटे के लिए बुक कर दो']){
  const result=parseBookingSpeech(input);assert.equal(result.device,5,input);assert.equal(result.minutes,120,input);
 }
 assert.equal(parseBookingSpeech('PC 3 one hour and thirty minutes').minutes,90);
 assert.equal(parseBookingSpeech('PC 2 half an hour').minutes,30);
 assert.equal(parseBookingSpeech('PC 2 derh ghanta').minutes,90);
 assert.equal(parseBookingSpeech('PS5 number 1 for two hours').device,11);
 assert.equal(parseBookingSpeech('PS5 two hours').device,null,'Duration must not become PS5 number');
});
test('dialogue asks name and price, explicitly confirms, then saves only a pending request',()=>{
 const d=new VoiceBookingDialogue(devices);d.start();
 assert.match(d.receive('PC five for two hours').message,/naam/);assert.equal(d.phase,'customer');
 assert.match(d.receive('Ahmed').message,/600 rupay/);assert.equal(d.phase,'confirm');
 assert.equal(d.receive('PC six for one hour').action,'listen');assert.equal(d.phase,'confirm');assert.equal(d.draft.device,6);
 const final=d.receive('haan book kar do');assert.equal(final.action,'submit');assert.deepEqual(final.draft,{device:6,minutes:60,customer:'Ahmed'});
 assert.equal(d.receive('yes'),null,'Duplicate confirmations cannot submit again');
 assert.match(d.saved().message,/Session abhi start nahi hua/);
});
test('cancellation, unsupported approval and invalid station/duration never start sessions',()=>{
 const d=new VoiceBookingDialogue(devices);assert.match(d.receive('unlock pc 5').message,/staff/);assert.equal(d.draft.device,null);
 d.receive('PC 11 two hours');assert.equal(d.phase,'device','PC 11 must not silently map to PS5');
 d.receive('PC 5 thirteen hours');assert.equal(d.phase,'duration');
 d.receive('60');d.receive('Ali');assert.equal(d.receive('yes nahi cancel').action,'done');assert.equal(d.phase,'done');
 const ps=new VoiceBookingDialogue(devices);ps.receive('PS5 two hours');ps.receive('1');assert.equal(ps.draft.device,11);
});
const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function harness({getDevices,createRequest}={}){
 const calls=[],spoken=[],messages=[],statuses=[];let assistant;
 class Recognition{start(){this.started=true;}abort(){this.aborted=true;}}
 class Utterance{constructor(text){this.text=text;}}
 const speech={getVoices:()=>[{name:'Test voice',lang:'en-GB'}],cancel(){},speak(u){assert.equal(assistant.recognition,null,'Microphone must be off while assistant speaks');spoken.push(u.text);queueMicrotask(()=>u.onend?.());}};
 assistant=new VoiceAssistant({Recognition,Utterance,speech,getDevices:getDevices|| (async()=>devices),createRequest:createRequest|| (async d=>calls.push(d)),onFields(){},onMessage:(role,text)=>messages.push({role,text}),onStatus:t=>statuses.push(t),onSubmitting(){}});
 const say=async text=>{const r=assistant.recognition;assert.ok(r?.onresult,'Assistant should be listening');r.onresult({results:[[{transcript:text}]]});await flush();};
 return {assistant,calls,spoken,messages,statuses,say};
}
test('speaking assistant carries a conversation and waits for server success',async()=>{
 const h=harness();try{
  await h.assistant.start();assert.ok(h.spoken.length);await h.say('PC five two hours');await h.say('Ahmed');assert.equal(h.calls.length,0);
  const listener=h.assistant.recognition.onresult;listener({results:[[{transcript:'yes'}]]});listener({results:[[{transcript:'yes'}]]});await flush();
  assert.deepEqual(h.calls,[{device:5,minutes:120,customer:'Ahmed'}]);assert.ok(h.spoken.at(-1).includes('has not started'));
 }finally{h.assistant.stop();}
});
test('availability is checked again after confirmation; busy PC is never submitted',async()=>{
 let checks=0;const h=harness({getDevices:async()=>++checks===1?devices:devices.map(d=>d.id===5?{...d,session:{id:9}}:d)});
 try{await h.assistant.start();await h.say('PC five two hours');await h.say('Ahmed');await h.say('yes');assert.equal(h.calls.length,0);assert.ok(h.messages.some(m=>m.text.includes('busy')));}
 finally{h.assistant.stop();}
});
test('save failure is reported without automatic retry or spoken success',async()=>{
 let attempts=0;const h=harness({createRequest:async()=>{attempts++;throw Error('Server unavailable');}});
 try{await h.assistant.start();await h.say('PC five two hours');await h.say('Ahmed');await h.say('yes');assert.equal(attempts,1);assert.ok(!h.spoken.some(t=>t.includes('has been saved')));assert.equal(h.assistant.active,false);}
 finally{h.assistant.stop();}
});

test('cloud voice failure is explained once and falls back without changing booking permissions',async()=>{
 const h=harness();h.assistant.voiceName=()=> 'cloud-urdu-female';let attempts=0;
 h.assistant.synthesize=async()=>{attempts++;throw Error('Google Text-to-Speech API enable karein.');};
 try{await h.assistant.start();await h.say('PC five two hours');assert.equal(attempts,1);assert.ok(h.messages.some(m=>m.text.includes('browser voice')));assert.equal(h.calls.length,0);assert.ok(h.spoken.length>=2);}
 finally{h.assistant.stop();}
});
test('cloud audio completes before microphone opens and stop cancels playback',async()=>{
 const h=harness();let audio;h.assistant.voiceName=()=> 'cloud-urdu-female';
 h.assistant.synthesize=async()=>({audioContent:'VGVzdA==',mimeType:'audio/mpeg'});
 h.assistant.AudioClass=class{constructor(){audio=this;}play(){assert.equal(h.assistant.recognition,null);return Promise.resolve();}pause(){this.paused=true;}};
 try{const started=h.assistant.start();await flush();assert.ok(audio);assert.equal(h.assistant.recognition,null);audio.onended();await started;assert.ok(h.assistant.recognition);
  const saying=h.say('PC five two hours');await flush();h.assistant.stop();await saying;assert.equal(audio.paused,true);assert.equal(h.assistant.active,false);assert.equal(h.assistant.recognition,null);
 }finally{h.assistant.stop();}
});

test('basic booking resolves PC labels independently of catalog IDs after stations are added',()=>{
 const catalog=[...devices,{id:13,name:'PC 11',kind:'PC',rate:450,session:null}];const d=new VoiceBookingDialogue(catalog);d.receive('PC eleven one hour');assert.equal(d.draft.device,13);assert.equal(d.phase,'customer');
});
