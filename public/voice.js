import {VoiceBookingDialogue} from './voice-dialogue.js';

export class VoiceAssistant{
 constructor({getDevices,createRequest,onFields,onMessage,onStatus,onSubmitting,synthesize=null,AudioClass=globalThis.Audio,language=()=> 'en-PK',voiceName=()=>'',speech=globalThis.speechSynthesis,Recognition=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition,Utterance=globalThis.SpeechSynthesisUtterance}){
  Object.assign(this,{getDevices,createRequest,onFields,onMessage,onStatus,onSubmitting,synthesize,AudioClass,language,voiceName,speech,Recognition,Utterance});this.recognition=null;this.turn=0;this.active=false;this.submitting=false;
 }
 abortRecognition(){if(this.recognition){this.recognition.onend=null;this.recognition.onerror=null;this.recognition.onresult=null;try{this.recognition.abort();}catch{}this.recognition=null;}}
 stopSpeech(){this.audioAbort?.abort();this.audioAbort=null;if(this.audio){this.audio.pause();this.audio=null;}if(this.audioUrl){URL.revokeObjectURL(this.audioUrl);this.audioUrl=null;}if(this.speechTimer)clearTimeout(this.speechTimer);this.finishSpeech?.();this.finishSpeech=null;this.speech?.cancel();}
 stop(message='Voice band hai. Nayi request ke liye Talk to assistant dabayein.'){
  this.turn++;this.active=false;this.abortRecognition();this.stopSpeech();this.onStatus(message);return !this.submitting;
 }
 async preview(){
  if(this.submitting)return;this.stop();this.cloudUnavailable=false;const turn=++this.turn;
  const step={message:'Urdu female voice sample. Cloud service configured na ho to browser fallback sunai degi.',speech:{ur:'السلام علیکم! میں آپ کی گیمنگ اسسٹنٹ ہوں۔ بتائیے، کون سا پی سی بک کرنا ہے؟',en:'Hello! I am your gaming assistant. Which PC would you like to book?',hi:'नमस्ते! मैं आपकी गेमिंग असिस्टेंट हूँ। कौन सा पीसी बुक करना है?'}};
  this.onMessage('assistant',step.message);this.onStatus('Voice sample chal raha hai…');
  try{await this.speak(step,turn);}catch{this.onStatus('Voice sample nahi chal saka. Browser ki sound permission check karein.');return;}
  if(turn===this.turn)this.onStatus('Sample complete. Booking ke liye Talk to assistant dabayein.');
 }
 async start(){
  if(this.submitting)return;
  this.cloudUnavailable=false;this.stop('Stations check ho rahe hain…');const turn=this.turn;
  if(!this.Recognition){this.onStatus('Is browser mein speech recognition supported nahi. Chrome/Edge mein kholein ya form use karein.');return;}
  try{const devices=await this.getDevices();if(turn!==this.turn)return;this.dialogue=new VoiceBookingDialogue(devices);this.active=true;await this.present(this.dialogue.start());}
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
  await this.speak(step,turn);if(turn!==this.turn||!this.active)return;
  if(step.action==='done'){this.active=false;this.onStatus('Voice complete. Staff approval alag zaroori hai.');return;}
  this.listenFor(turn);
 }
 listen(){if(!this.active||this.submitting)return;const turn=++this.turn;this.abortRecognition();this.stopSpeech();this.listenFor(turn);}
 listenFor(turn){
  if(!this.active||turn!==this.turn||this.submitting)return;
  const recognition=new this.Recognition();this.recognition=recognition;recognition.lang=this.language();recognition.continuous=false;recognition.interimResults=false;let heard=false;
  recognition.onresult=e=>{if(turn!==this.turn||heard)return;heard=true;const text=e.results[0][0].transcript;this.abortRecognition();this.onMessage('you',text);if(this.handleTranscript){void this.handleTranscript(text);return;}const step=this.dialogue.receive(text);if(step?.action==='submit')void this.submit(step);else void this.present(step);};
  recognition.onerror=e=>{if(turn!==this.turn)return;heard=true;this.abortRecognition();this.onStatus(e.error==='not-allowed'?'Microphone permission dein; phir dobara Talk to assistant dabayein.':'Awaaz nahi samajh aayi ya voice service unavailable. Dobara suno button dabayein, ya form use karein.');};
  recognition.onend=()=>{if(turn===this.turn&&!heard){this.recognition=null;this.onStatus('Kuch suna nahi. Dobara suno button dabayein.');}};
  this.onStatus('Sun raha hoon…');try{recognition.start();}catch{this.onStatus('Microphone busy hai. Dobara suno button dabayein.');}
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
