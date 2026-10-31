import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AIChatAssistant} from '../public/ai-agent.js';
const reply={reply:'Aaj ki report tayyar hai.',speech:{ur:'آج کی رپورٹ تیار ہے۔',hi:'आज की रिपोर्ट तैयार है।',en:'Today’s report is ready.'},actions:[{id:'a'.repeat(48),summary:'Staff confirmation required'}]};
function harness(chat){
 const messages=[],spoken=[],cards=[];
 class Utterance{constructor(text){this.text=text;}}
 const speech={getVoices:()=>[{name:'Hindi system voice',lang:'hi-IN'}],cancel(){},speak(u){spoken.push(u.text);queueMicrotask(()=>u.onend?.());}};
 const agent=new AIChatAssistant({chat,onActions:c=>cards.push(c),getDevices:async()=>[],createRequest:async()=>{throw Error('AI must not execute booking directly');},onFields(){},onMessage:(role,text)=>messages.push({role,text}),onStatus(){},onSubmitting(){},speech,Utterance,Recognition:class{},language:()=> 'ur-PK'});
 return {agent,messages,spoken,cards};
}
test('free-form AI question reaches model chat, remembers context and speaks available Hindi for Urdu fallback',async()=>{
 const calls=[];const h=harness(async body=>{calls.push(body);return reply;});
 try{await h.agent.send('Aaj ki earning aur PC usage batao');assert.equal(calls[0].message,'Aaj ki earning aur PC usage batao');assert.equal(h.spoken[0],reply.speech.hi);assert.deepEqual(h.cards[0],reply.actions);await h.agent.send('Ali ki history bhi batao');assert.equal(calls[1].history[0].role,'user');assert.equal(calls[1].history[0].text,'Aaj ki earning aur PC usage batao');assert.equal(h.agent.active,false,'Typed chat must not start microphone without a click');}
 finally{h.agent.stop();}
});
test('clearing the conversation prevents late AI response from restoring actions',async()=>{
 let resolve;const h=harness(()=>new Promise(r=>resolve=r));
 try{const pending=h.agent.send('PC five book karo');h.agent.clear();resolve(reply);await pending;assert.equal(h.agent.history.length,0);assert.ok(h.cards.every(c=>c.length===0));assert.ok(!h.messages.some(m=>m.text===reply.reply));}
 finally{h.agent.stop();}
});
