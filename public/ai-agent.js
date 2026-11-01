import {VoiceAssistant} from './voice.js';
export class AIChatAssistant extends VoiceAssistant{
 constructor(options){super({...options,continuousConversation:true});this.chat=options.chat;this.onActions=options.onActions;this.handsFreeControl=options.handsFreeControl;this.onAutoBooking=options.onAutoBooking||(()=>{});this.onExecutions=options.onExecutions||(()=>{});this.history=[];this.dialogue={draft:{device:null,minutes:null,customer:''}};}
 stop(message,preserveHandsFree=false){
  this.chatAbort?.abort();let lease;
  if(!preserveHandsFree){lease=this.grant;this.grant=null;this.enablingHandsFree=false;clearTimeout(this.grantTimer);}
  const result=super.stop(message,preserveHandsFree),turn=this.turn;
  if(!preserveHandsFree){this.onAutoBooking({enabled:false,pending:lease?'disable':null});if(lease&&this.handsFreeControl)void this.handsFreeControl({mode:'disable',lease:lease.lease}).then(()=>{if(this.turn===turn&&!this.grant)this.onAutoBooking({enabled:false,confirmed:true});}).catch(()=>{if(this.turn===turn&&!this.grant)this.onAutoBooking({enabled:false,warning:'Mic band hai, lekin server-off tasdeeq nahi hui. Aakhri bheji hui booking complete ho sakti hai; dashboard check karein. Permission 60 seconds mein expire hogi.'});});}
  return result;
 }
 async enableHandsFree(){
  if(!this.handsFreeControl)return super.enableHandsFree();
  if(this.submitting||!this.Recognition){this.onStatus('AI ka jawab ya microphone availability check karein.');return;}
  this.stop();const turn=this.turn;this.enablingHandsFree=true;this.onAutoBooking({enabled:false,pending:'enable'});this.onStatus('Hands-free auto-booking permission on ho rahi hai…');
  try{
   const grant=await this.handsFreeControl({mode:'enable'});
   if(turn!==this.turn){void this.handsFreeControl({mode:'disable',lease:grant.lease}).catch(()=>{});return;}
   this.grant=grant;this.enablingHandsFree=false;super.enableHandsFree();
   if(this.handsFreeEnabled){this.onAutoBooking({enabled:true});this.renewHandsFree();await this.start();}else this.stop();
  }catch(error){if(turn===this.turn)this.stop('Hands-free on nahi hui. '+(error.message||'Connection check karke dobara try karein.'));}
 }
 renewHandsFree(){
  clearTimeout(this.grantTimer);if(!this.grant||!this.handsFreeEnabled)return;
  this.grantTimer=setTimeout(async()=>{
   const grant=this.grant;if(!grant||!this.handsFreeEnabled)return;
   try{const updated=await this.handsFreeControl({mode:'renew',lease:grant.lease});if(this.grant===grant&&this.handsFreeEnabled){this.grant=updated;this.renewHandsFree();}}
   catch{if(this.grant===grant)this.stop('Auto-booking permission renew nahi hui. Hands-free band hai; connection check karein.');}
  },20000);
 }
 clear(){this.stop('Nayi AI conversation tayyar hai.');this.history=[];this.onActions([]);}
 async start(){
  if(!this.Recognition){this.onStatus('Is browser mein voice recognition available nahi. Typed AI chat ya Chrome/Edge use karein.');return;}
  if(this.submitting)return;this.stop(undefined,true);this.cloudUnavailable=false;this.active=true;
  const name=String(this.wakeWord()||'Maya').slice(0,30);
  await this.present({message:`Hi! Main ${name} hoon. Kaunsa PC book karna hai?`,speech:{ur:`ہائے! میں ${name} ہوں۔ کون سا پی سی بک کرنا ہے؟`,hi:`हाय! मैं ${name} हूँ। कौन सा पीसी बुक करना है?`,en:`Hi! I'm ${name}. Which PC would you like to book?`},action:'listen'});
 }
 handleTranscript(text){return this.send(text,false);}
 async send(text,echo=true){
  text=String(text||'').trim();if(!text||this.submitting)return;
  this.abortRecognition();this.stopSpeech();const turn=++this.turn;this.submitting=true;this.onSubmitting(true);this.onStatus('AI soch raha hai…');if(echo)this.onMessage('you',text);
  const controller=new AbortController();this.chatAbort=controller;const timer=setTimeout(()=>controller.abort(),28000);
  try{
   const reply=await this.chat({message:text,history:this.history.slice(-8),handsFreeLease:this.handsFreeEnabled?this.grant?.lease:undefined},controller.signal);
   if(turn!==this.turn)return;
   this.history.push({role:'user',text:text.slice(0,650)},{role:'assistant',text:reply.reply.slice(0,650)});this.history=this.history.slice(-8);
   if(reply.executions?.length)await this.onExecutions(reply.executions);
   if(turn!==this.turn)return;
   this.onActions(reply.actions||[]);this.submitting=false;this.onSubmitting(false);
   await this.present({message:reply.reply,speech:reply.speech,action:'listen'});
  }catch(e){if(turn!==this.turn)return;this.active=false;this.onMessage('assistant',e.name==='AbortError'?'AI response timeout. Dashboard check karein; aakhri booking save ho chuki ho sakti hai.':e.message);this.onStatus('AI jawab nahi de saka. Manual dashboard ya basic booking mode use karein.');}
  finally{clearTimeout(timer);if(this.chatAbort===controller){this.chatAbort=null;this.submitting=false;this.onSubmitting(false);if(!this.active&&this.handsFreeEnabled)this.queueListening(this.turn,'wake');}}
 }
 async confirmed(result,continueConversation=this.handsFreeEnabled){
  if(continueConversation)this.active=true;
  const message=result.message;
  this.history.push({role:'assistant',text:`Server confirmed ${result.action}: ${message}`});this.history=this.history.slice(-8);
  await this.present({message,speech:{ur:result.action==='request'?'بکنگ کی درخواست محفوظ ہو گئی۔ سیشن شروع کرنے کے لیے اسٹاف کی الگ منظوری ضروری ہے۔':'آپ کی منظوری کے بعد عمل سرور پر مکمل ہو گیا۔ ڈیش بورڈ پر تازہ حالت دیکھیں۔',hi:result.action==='request'?'बुकिंग अनुरोध सेव हो गया। सेशन शुरू करने के लिए स्टाफ की अलग मंजूरी जरूरी है।':'आपकी मंजूरी के बाद कार्रवाई सर्वर पर पूरी हुई। डैशबोर्ड पर स्थिति जांचें।',en:result.action==='request'?'The pending booking request was saved. Staff must separately approve it to start the session.':'The server completed the confirmed action. Check the dashboard; delivery to the device is separate.'},action:continueConversation?'listen':'done'});
 }
}
