import {VoiceBookingDialogue} from './voice-dialogue.js';
import {wakeCommand,endsConversation,disablesHandsFree} from './wake-word.js';

export class VoiceAssistant{
 constructor({getDevices,createRequest,onFields,onMessage,onStatus,onSubmitting,onHandsFree=()=>{},onWakeHeard=()=>{},wakeWord=()=> 'Maya',continuousConversation=false,synthesize=null,AudioClass=globalThis.Audio,language=()=> 'en-PK',voiceName=()=>'',speech=globalThis.speechSynthesis,Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition,Utterance=globalThis.SpeechSynthesisUtterance}){
  Object.assign(this,{getDevices,createRequest,onFields,onMessage,onStatus,onSubmitting,onHandsFree,onWakeHeard,wakeWord,continuousConversation,synthesize,AudioClass,language,voiceName,speech,Recognition,Utterance});this.handsFreeEnabled=false;this.recognitionFailures=0;this.recognition=null;this.turn=0;this.active=false;this.submitting=false;
 }
 abortRecognition(){clearTimeout(this.wakeWatchdog);this.wakeWatchdog=null;clearTimeout(this.restartTimer);this.restartTimer=null;if(this.recognition){this.recognition.onend=null;this.recognition.onerror=null;this.recognition.onresult=null;this.recognition.onstart=null;this.recognition.onaudiostart=null;this.recognition.onspeechstart=null;this.recognition.onspeechend=null;try{this.recognition.abort();}catch{}this.recognition=null;}}
 stopSpeech(){this.audioAbort?.abort();this.audioAbort=null;if(this.audio){this.audio.pause();this.audio=null;}if(this.audioUrl){URL.revokeObjectURL(this.audioUrl);this.audioUrl=null;}if(this.speechTimer)clearTimeout(this.speechTimer);this.finishSpeech?.();this.finishSpeech=null;this.speech?.cancel();}
 stop(message='Voice band hai. Nayi request ke liye Talk to assistant dabayein.',preserveHandsFree=false){
  if(!preserveHandsFree){this.handsFreeEnabled=false;this.onHandsFree(false);}
  this.turn++;this.active=false;this.abortRecognition();this.stopSpeech();this.onStatus(message);return !this.submitting;
 }
 enableHandsFree(){
  if(this.submitting){this.onStatus('AI ke jawab ka intezar karein ya Stop voice dabayein.');return;}
  if(!this.Recognition){this.onStatus('Hands-free speech recognition is browser mein available nahi. Chrome/Edge use karein.');return;}
  if(wakeCommand(this.wakeWord(),this.wakeWord())===null){this.onStatus('Assistant ka naam 2–30 letters/numbers mein rakhein.');return;}
  this.stop(undefined,true);this.handsFreeEnabled=true;this.recognitionFailures=0;this.onHandsFree(true);this.listenForWake(this.turn);
 }
 sleep(){
  this.stop('Conversation pause. Naam lene par dobara shuru hogi.',true);
  if(this.handsFreeEnabled)this.queueListening(this.turn,'wake');
 }
 queueListening(turn,mode,delay=600){
  clearTimeout(this.restartTimer);
  this.restartTimer=setTimeout(()=>{
   this.restartTimer=null;if(turn!==this.turn)return;
   if(mode==='wake'){if(this.handsFreeEnabled&&!this.active&&!this.submitting)this.listenForWake(turn);}
   else if(this.active&&!this.submitting)this.listenFor(turn);
  },delay);
 }
 recognitionError(error,turn,mode){
  if(turn!==this.turn)return;this.abortRecognition();
  if(['not-allowed','service-not-allowed','audio-capture','language-not-supported'].includes(error)){
   this.stop('Microphone permission/device/language check karein. Hands-free band hai; theek karne ke baad dobara enable karein.');return;
  }
  if(error==='no-speech'){this.onStatus(mode==='wake'?`Naam ka intezar: ${this.wakeWord()}`:'Sun raha hoon…');if(mode==='wake'||this.continuousConversation||this.handsFreeEnabled)this.queueListening(turn,mode);return;}
  if(++this.recognitionFailures>=3){this.stop(`Voice service baar baar fail hui (${error}). Chrome/Edge aur mic connection check karke hands-free dobara enable karein.`);return;}
  this.onStatus(`Voice service reconnect ho rahi hai… (${error})`);
  if(mode==='wake'||this.continuousConversation||this.handsFreeEnabled)this.queueListening(turn,mode,1000*this.recognitionFailures);
 }
 listenForWake(turn){
  if(turn!==this.turn||!this.handsFreeEnabled||this.active||this.submitting)return;
  this.abortRecognition();const recognition=new this.Recognition();this.recognition=recognition;recognition.lang=/^[a-z0-9 -]+$/i.test(this.wakeWord())?'en-US':this.language();recognition.continuous=false;recognition.interimResults=true;recognition.maxAlternatives=5;let woke=false;
  const watch=(delay,error)=>{clearTimeout(this.wakeWatchdog);this.wakeWatchdog=setTimeout(()=>{if(turn!==this.turn||this.recognition!==recognition||woke)return;woke=true;this.recognitionError(error,turn,'wake');},delay);};
  recognition.onresult=event=>{
   if(turn!==this.turn||woke)return;
   for(let i=event.resultIndex||0;i<event.results.length;i++){
    const result=event.results[i],raw=result[0]?.transcript||'';this.recognitionFailures=0;watch(45000,'wake-idle-timeout');this.onWakeHeard(raw);
    if(disablesHandsFree(raw)||disablesHandsFree(wakeCommand(raw,this.wakeWord())||'')){if(result.isFinal===false)continue;woke=true;this.stop('Hands-free off. Mic aur auto-booking band hain.');return;}
    for(let alternative=0;alternative<result.length;alternative++){
     const command=wakeCommand(result[alternative].transcript,this.wakeWord());
     // Only a name alone can wake on partial speech. Never execute a partial command.
     if(command===null||result.isFinal===false&&command!=='')continue;
     woke=true;this.recognitionFailures=0;this.abortRecognition();void this.wake(command).catch(()=>this.stop('Voice start nahi hui. Hands-free dobara enable karein.'));return;
    }
   }
  };
  recognition.onerror=event=>{woke=true;this.recognitionError(event.error,turn,'wake');};
  recognition.onend=()=>{if(turn===this.turn&&!woke){clearTimeout(this.wakeWatchdog);this.wakeWatchdog=null;this.recognition=null;this.queueListening(turn,'wake');}};
  recognition.onstart=()=>{if(turn===this.turn&&!woke){watch(45000,'wake-idle-timeout');this.onStatus(`Wake listener connected. "${this.wakeWord()}" bolein.`);}};
  recognition.onaudiostart=()=>{if(turn===this.turn&&!woke)this.onStatus(`Mic audio ON. "${this.wakeWord()}" bolein.`);};
  recognition.onspeechstart=()=>{if(turn===this.turn&&!woke){watch(15000,'wake-result-timeout');this.onStatus('Awaaz mili. Naam pehchana ja raha hai…');}};
  recognition.onspeechend=()=>{if(turn===this.turn&&!woke)watch(6000,'wake-result-timeout');};
  this.onStatus(`Wake mic connect ho raha hai. "${this.wakeWord()}" ka naam lein.`);
  watch(8000,'wake-start-timeout');
  try{recognition.start();}catch{this.recognitionError('start-failed',turn,'wake');}
 }
 async wake(command){
  if(endsConversation(command)){this.sleep();return;}
  await this.start();if(!this.active){if(this.handsFreeEnabled)this.queueListening(this.turn,'wake');return;}if(!command||this.submitting)return;
  this.abortRecognition();this.onMessage('you',command);
  if(this.handleTranscript)await this.handleTranscript(command);
  else{const step=this.dialogue.receive(command);if(step?.action==='submit')await this.submit(step);else await this.present(step);}
 }
 async preview(){
  if(this.submitting)return;this.stop();this.cloudUnavailable=false;const turn=++this.turn;
  const name=String(this.wakeWord()||'Maya').slice(0,30);
  const step={message:`Hi! Main ${name} hoon. Kaunsa PC book karna hai?`,speech:{ur:`ہائے! میں ${name} ہوں۔ کون سا پی سی بک کرنا ہے؟`,en:`Hi! I'm ${name}. Which PC would you like to book?`,hi:`हाय! मैं ${name} हूँ। कौन सा पीसी बुक करना है?`}};
  this.onMessage('assistant',step.message);this.onStatus('Voice sample chal raha hai…');
  try{await this.speak(step,turn);}catch{this.onStatus('Voice sample nahi chal saka. Browser ki sound permission check karein.');return;}
  if(turn===this.turn)this.onStatus('Sample complete. Booking ke liye Talk to assistant dabayein.');
 }
 async start(){
  if(this.submitting)return;
  this.cloudUnavailable=false;this.stop('Stations check ho rahe hain…',true);const turn=this.turn;
  if(!this.Recognition){this.onStatus('Is browser mein speech recognition supported nahi. Chrome/Edge mein kholein ya form use karein.');return;}
  try{const devices=await this.getDevices();if(turn!==this.turn)return;this.dialogue=new VoiceBookingDialogue(devices,this.wakeWord());this.active=true;await this.present(this.dialogue.start());}
  catch{if(turn===this.turn)this.onStatus('Stations load nahi hue. Connection check karein aur dobara button dabayein.');}
 }
 async cloudSpeak(text,turn){
  const controller=new AbortController();this.audioAbort=controller;const signal=controller.signal;
  const timer=setTimeout(()=>controller.abort(),24000);
  let result;try{result=await this.synthesize(text,signal);}finally{clearTimeout(timer);}
  if(turn!==this.turn)return;if(signal.aborted)throw new Error('Cloud voice timeout.');
  const bytes=Uint8Array.from(atob(result.audioContent),c=>c.charCodeAt(0));
  this.audioUrl=URL.createObjectURL(new Blob([bytes],{type:result.mimeType||'audio/mpeg'}));
  const audio=new this.AudioClass(this.audioUrl);this.audio=audio;
  await new Promise((resolve,reject)=>{
   let done=false;const finish=(error)=>{if(done)return;done=true;clearTimeout(this.speechTimer);this.finishSpeech=null;error?reject(error):resolve();};
   this.finishSpeech=()=>finish();audio.onended=()=>finish();audio.onerror=()=>finish(new Error('Audio play nahi ho saki. Browser ki sound permission check karein.'));
   this.speechTimer=setTimeout(()=>{audio.pause();finish(new Error('Voice playback timeout.'));},45000);
   audio.play().catch(e=>finish(e));
  });
  if(this.audio===audio){this.audio=null;URL.revokeObjectURL(this.audioUrl);this.audioUrl=null;}
 }
 async speak(step,turn){
  if(this.voiceName()==='cloud-urdu-female'&&this.synthesize&&!this.cloudUnavailable){
   try{await this.cloudSpeak(step.speech.ur.replace(/\bPC (\d+)/g,'پی سی $1').replace(/\bPS5 (\d+)/g,'پلے اسٹیشن $1'),turn);return;}
   catch(e){if(turn!==this.turn)return;this.cloudUnavailable=true;this.onMessage('assistant',`${e.message||'Cloud voice unavailable.'} Filhal browser voice use ho rahi hai.`);this.stopSpeech();}
  }
  if(!this.speech||!this.Utterance)return;
  const voices=this.speech.getVoices(),selected=voices.find(v=>v.name===this.voiceName());
  const desired=this.language().split('-')[0];
  const voice=selected||voices.find(v=>v.lang.toLowerCase().startsWith(desired))||(desired==='ur'?voices.find(v=>v.lang.toLowerCase().startsWith('hi')):null)||voices.find(v=>v.lang.toLowerCase().startsWith('en'));
  const family=voice?.lang?.slice(0,2).toLowerCase()||'en';
  const text=step.speech[family]||step.speech.en;
  await new Promise(resolve=>{
   let finished=false;
   const finish=()=>{if(finished)return;finished=true;clearTimeout(this.speechTimer);this.finishSpeech=null;resolve();};this.finishSpeech=finish;
   const utterance=new this.Utterance(text);utterance.lang=voice?.lang||'en-GB';if(voice)utterance.voice=voice;utterance.rate=0.95;
   utterance.onend=finish;utterance.onerror=finish;this.speechTimer=setTimeout(finish,30000);
   if(turn!==this.turn){finish();return;}this.speech.speak(utterance);
  });
 }
 async present(step){
  if(!step)return;const turn=++this.turn;this.abortRecognition();this.stopSpeech();
  this.onMessage('assistant',step.message);this.onFields({...this.dialogue.draft});this.onStatus('Assistant bol raha hai…');
  await this.speak(step,turn);if(turn!==this.turn)return;if(!this.active){if(this.handsFreeEnabled)this.queueListening(turn,'wake');return;}
  if(step.action==='done'){this.active=false;this.onStatus('Voice complete. Staff approval alag zaroori hai.');if(this.handsFreeEnabled)this.queueListening(turn,'wake');return;}
  this.listenFor(turn);
 }
 listen(){if(!this.active||this.submitting)return;const turn=++this.turn;this.abortRecognition();this.stopSpeech();this.listenFor(turn);}
 listenFor(turn){
  if(!this.active||turn!==this.turn||this.submitting)return;
  this.abortRecognition();
  const recognition=new this.Recognition();this.recognition=recognition;recognition.lang=this.language();recognition.continuous=false;recognition.interimResults=false;let heard=false;
  recognition.onresult=e=>{if(turn!==this.turn||heard)return;heard=true;const text=e.results[0][0].transcript;this.recognitionFailures=0;this.abortRecognition();if(disablesHandsFree(text)||disablesHandsFree(wakeCommand(text,this.wakeWord())||'')){this.onMessage('you',text);this.stop('Hands-free off. Mic aur auto-booking band hain.');return;}if(endsConversation(text)){this.onMessage('you',text);this.sleep();return;}this.onMessage('you',text);if(this.handleTranscript){void this.handleTranscript(text);return;}const step=this.dialogue.receive(text);if(step?.action==='submit')void this.submit(step);else void this.present(step);};
  recognition.onerror=e=>{if(turn!==this.turn)return;heard=true;this.recognitionError(e.error,turn,'conversation');};
  recognition.onend=()=>{if(turn===this.turn&&!heard){this.recognition=null;if(this.continuousConversation||this.handsFreeEnabled){this.onStatus('Sun raha hoon…');this.queueListening(turn,'conversation');}else this.onStatus('Kuch suna nahi. Dobara suno button dabayein.');}};
  this.onStatus('Sun raha hoon…');try{recognition.start();}catch{this.recognitionError('start-failed',turn,'conversation');}
 }
 async submit(step){
  if(this.submitting)return;this.submitting=true;this.abortRecognition();const turn=++this.turn;this.onSubmitting(true);this.onStatus('Request save ho rahi hai…');
  try{
   const devices=await this.getDevices();
   // Cancellation before the network write really prevents submission.
   if(!this.active||turn!==this.turn)return;
   const device=devices.find(d=>d.id===step.draft.device);
   if(!device||device.session||device.rate!==step.rate){
    this.dialogue.devices=devices;this.dialogue.phase='confirm';this.submitting=false;this.onSubmitting(false);await this.present(this.dialogue.next());return;
   }
   await this.createRequest({...step.draft});
   // Never claim success until the authenticated server has saved the request.
   if(this.active&&turn===this.turn)await this.present(this.dialogue.saved());
   else this.onMessage('assistant','Request server par save ho gayi. Awaiting approval list check karein.');
  }catch(e){
   this.dialogue.phase='done';this.active=false;this.onStatus('Request ki tasdeeq nahi hui. Awaiting approval list check karein; automatic retry nahi ki gayi.');this.onMessage('assistant',e.message||'Request save nahi ho saki.');
  }finally{this.submitting=false;this.onSubmitting(false);}
 }
}
