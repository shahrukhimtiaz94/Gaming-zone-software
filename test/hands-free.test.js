import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wakeCommand,endsConversation,disablesHandsFree} from '../public/wake-word.js';
import {AIChatAssistant} from '../public/ai-agent.js';
const flush=async()=>{for(let i=0;i<40;i++)await Promise.resolve();};
function harness(){
 const calls=[],messages=[],microphones=[];let assistant;
 class Recognition{constructor(){microphones.push(this);}start(){this.started=true;}abort(){this.aborted=true;}}
 class Utterance{constructor(text){this.text=text;}}
 assistant=new AIChatAssistant({Recognition,Utterance,speech:{getVoices:()=>[{name:'Test',lang:'en-GB'}],cancel(){},speak(u){assert.equal(assistant.recognition,null,'Microphone must be off during assistant speech');queueMicrotask(()=>u.onend?.());}},chat:async body=>{calls.push(body);return {reply:'Report tayyar hai.',speech:{en:'The report is ready.',ur:'رپورٹ تیار ہے۔',hi:'रिपोर्ट तैयार है।'},actions:[]};},onFields(){},onMessage:(role,text)=>messages.push({role,text}),onStatus(){},onSubmitting(){},onHandsFree(){},wakeWord:()=> 'Maya',language:()=> 'en-PK',onActions(){}});
 const say=async text=>{assert.ok(assistant.recognition?.onresult);assistant.recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:true})]});await flush();};
 return {assistant,calls,messages,microphones,say};
}
test('wake name requires word boundaries, supports Urdu/Hindi aliases and custom names',()=>{
 assert.equal(wakeCommand('Hey Nexus, PC five free hai?','Nexus'),'PC five free hai?');
 assert.equal(wakeCommand('نیکسس آج کی رپورٹ بتاؤ','Nexus'),'آج کی رپورٹ بتاؤ');
 assert.equal(wakeCommand('नेक्सस रिपोर्ट बताओ','Nexus'),'रिपोर्ट बताओ');
 assert.equal(wakeCommand('Jarvis help me','Jarvis'),'help me');
 assert.equal(wakeCommand('نیکسا آج کی رپورٹ بتاؤ','Nexa'),'آج کی رپورٹ بتاؤ');
 assert.equal(wakeCommand('annexus is a word'),null);assert.equal(wakeCommand('nexusgaming is busy'),null);
 assert.equal(wakeCommand('Maya'),'');assert.equal(wakeCommand('مایا رپورٹ بتاؤ'),'رپورٹ بتاؤ');assert.equal(wakeCommand('سٹیلا رپورٹ بتاؤ','Stella'),'رپورٹ بتاؤ');assert.equal(wakeCommand('स्टेला रिपोर्ट बताओ','Stella'),'रिपोर्ट बताओ');assert.equal(wakeCommand('stellar is a word'),null);assert.equal(wakeCommand('Anything','x'),null);
});
test('OK thanks is the stop phrase and normal sentences do not end conversation',()=>{
 for(const phrase of ['OK thanks','okay, thanks!','اوکے تھینکس','ओके थैंक्स'])assert.equal(endsConversation(phrase),true,phrase);
 for(const phrase of ['Thanks for the report, PC five ka batao','PC five thanks','bas'])assert.equal(endsConversation(phrase),false,phrase);
});
test('hands-free ignores ambient words, wakes by name, keeps talking and returns to wake mode on OK thanks',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=harness();
 try{
  h.assistant.enableHandsFree();assert.equal(h.assistant.handsFreeEnabled,true);assert.equal(h.assistant.recognition.continuous,true);
  await h.say('PC five two hours');assert.equal(h.calls.length,0);assert.equal(h.messages.length,0,'Ambient speech must not be sent to model or chat log');
  await h.say('Maya aaj ki earning batao');assert.equal(h.calls.length,1);assert.equal(h.calls[0].message,'aaj ki earning batao');assert.equal(h.assistant.active,true);
  await h.say('PC five ka status bhi batao');assert.equal(h.calls.length,2);assert.ok(h.assistant.recognition);
  const before=h.microphones.length;h.assistant.recognition.onend();t.mock.timers.tick(650);assert.equal(h.microphones.length,before+1,'Silence must re-arm conversation without another click');
  await h.say('OK thanks');assert.equal(h.calls.length,2,'Stop phrase must not consume AI quota');assert.equal(h.assistant.active,false);assert.equal(h.assistant.handsFreeEnabled,true);
  t.mock.timers.tick(650);assert.equal(h.assistant.recognition.continuous,true);
  await h.say('Maya');assert.equal(h.assistant.active,true);assert.equal(h.calls.length,2,'Name alone greets without a model request');
  h.assistant.stop();t.mock.timers.tick(5000);assert.equal(h.assistant.recognition,null);assert.equal(h.assistant.handsFreeEnabled,false);
 }finally{h.assistant.stop();}
});
test('microphone denial stops hands-free; repeated network failures have a bounded retry',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=harness();
 try{
  h.assistant.enableHandsFree();h.assistant.recognition.onerror({error:'not-allowed'});t.mock.timers.tick(10000);assert.equal(h.assistant.handsFreeEnabled,false);assert.equal(h.assistant.recognition,null);
  h.assistant.enableHandsFree();for(let i=1;i<=3;i++){h.assistant.recognition.onerror({error:'network'});t.mock.timers.tick(1000*i);}
  assert.equal(h.assistant.handsFreeEnabled,false);assert.equal(h.assistant.recognition,null);
 }finally{h.assistant.stop();}
});

test('hands-free off phrase disables microphone even in wake waiting mode',async()=>{
 const h=harness();try{h.assistant.enableHandsFree();await h.say('Maya hands-free off');assert.equal(h.assistant.handsFreeEnabled,false);assert.equal(h.assistant.recognition,null);assert.equal(h.calls.length,0);assert.equal(disablesHandsFree('hands free off'),true);}finally{h.assistant.stop();}
});

test('server auto-booking lease is sent with AI requests, renewed and revoked when turned off',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=harness();const modes=[];
 h.assistant.handsFreeControl=async body=>{modes.push(body);return body.mode==='disable'?{disabled:true}:{lease:'a'.repeat(48),expires:Date.now()+60000};};
 try{await h.assistant.enableHandsFree();assert.equal(h.assistant.grant.lease,'a'.repeat(48));await h.say('Maya PC five book karo');assert.equal(h.calls[0].handsFreeLease,'a'.repeat(48));t.mock.timers.tick(20000);await flush();assert.ok(modes.some(m=>m.mode==='renew'));h.assistant.stop();await flush();assert.equal(h.assistant.grant,null);assert.equal(modes.at(-1).mode,'disable');}
 finally{h.assistant.stop();}
});
test('late server enable after local off cannot turn auto-booking back on',async()=>{
 const h=harness();let resolve;const modes=[];h.assistant.handsFreeControl=body=>{modes.push(body.mode);return body.mode==='enable'?new Promise(r=>resolve=r):Promise.resolve({disabled:true});};
 try{const pending=h.assistant.enableHandsFree();h.assistant.stop();resolve({lease:'b'.repeat(48),expires:Date.now()+60000});await pending;await flush();assert.equal(h.assistant.handsFreeEnabled,false);assert.equal(h.assistant.grant,null);assert.equal(h.assistant.recognition,null);assert.deepEqual(modes,['enable','disable']);}
 finally{h.assistant.stop();}
});

test('dashboard hands-free enable greets and opens conversation after server grant without Talk button',async()=>{
 const h=harness();h.assistant.handsFreeControl=async()=>({lease:'c'.repeat(48),expires:Date.now()+60000});
 try{await h.assistant.enableHandsFree();assert.equal(h.assistant.handsFreeEnabled,true);assert.equal(h.assistant.active,true);assert.ok(h.assistant.recognition?.started);assert.equal(h.assistant.recognition.continuous,false);await h.say('PC five Ahmed ke liye one hour');assert.equal(h.calls.length,1);assert.equal(h.calls[0].handsFreeLease,'c'.repeat(48));}
 finally{h.assistant.stop();}
});
test('name alone wakes from a partial result and an alternative transcript wakes after OK thanks',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const h=harness();
 try{
  h.assistant.enableHandsFree();assert.equal(h.assistant.recognition.interimResults,true);
  h.assistant.recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'مایا'}],{isFinal:false})]});await flush();assert.equal(h.assistant.active,true);assert.equal(h.calls.length,0);
  await h.say('OK thanks');t.mock.timers.tick(650);
  h.assistant.recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:'my'},{transcript:'Maya'}],{isFinal:true})]});await flush();assert.equal(h.assistant.active,true);assert.equal(h.calls.length,0);
 }finally{h.assistant.stop();}
});
test('partial booking and unrelated partial speech never reach the model',async()=>{
 const h=harness();try{
  h.assistant.enableHandsFree();for(const text of ['PC five two hours','Maya PC five book'])h.assistant.recognition.onresult({resultIndex:0,results:[Object.assign([{transcript:text}],{isFinal:false})]});await flush();assert.equal(h.assistant.active,false);assert.equal(h.calls.length,0);
 }finally{h.assistant.stop();}
});
