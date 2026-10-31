import {VoiceAssistant} from './voice.js';
export class AIChatAssistant extends VoiceAssistant{
 constructor(options){super({...options,continuousConversation:true});this.chat=options.chat;this.onActions=options.onActions;this.history=[];this.dialogue={draft:{device:null,minutes:null,customer:''}};}
 stop(message,preserveHandsFree=false){this.chatAbort?.abort();return super.stop(message,preserveHandsFree);}
 clear(){this.stop('Nayi AI conversation tayyar hai.');this.history=[];this.onActions([]);}
 async start(){
  if(!this.Recognition){this.onStatus('Is browser mein voice recognition available nahi. Typed AI chat ya Chrome/Edge use karein.');return;}
  if(this.submitting)return;this.stop(undefined,true);this.cloudUnavailable=false;this.active=true;
  const name=String(this.wakeWord()||'Stella').slice(0,30);
  await this.present({message:`Hi! Main ${name} hoon. Kaunsa PC book karna hai?`,speech:{ur:`ہائے! میں ${name} ہوں۔ کون سا پی سی بک کرنا ہے؟`,hi:`हाय! मैं ${name} हूँ। कौन सा पीसी बुक करना है?`,en:`Hi! I'm ${name}. Which PC would you like to book?`},action:'listen'});
 }
 handleTranscript(text){return this.send(text,false);}
 async send(text,echo=true){
  text=String(text||'').trim();if(!text||this.submitting)return;
  this.abortRecognition();this.stopSpeech();const turn=++this.turn;this.submitting=true;this.onSubmitting(true);this.onStatus('AI soch raha hai…');if(echo)this.onMessage('you',text);
  const controller=new AbortController();this.chatAbort=controller;const timer=setTimeout(()=>controller.abort(),28000);
  try{
   const reply=await this.chat({message:text,history:this.history.slice(-8)},controller.signal);
   if(turn!==this.turn)return;
   this.history.push({role:'user',text:text.slice(0,650)},{role:'assistant',text:reply.reply.slice(0,650)});this.history=this.history.slice(-8);
   this.onActions(reply.actions||[]);this.submitting=false;this.onSubmitting(false);
   await this.present({message:reply.reply,speech:reply.speech,action:'listen'});
  }catch(e){if(turn!==this.turn)return;this.active=false;this.onMessage('assistant',e.name==='AbortError'?'AI response timeout. Koi action automatic execute nahi hua.':e.message);this.onStatus('AI jawab nahi de saka. Manual dashboard ya basic booking mode use karein.');}
  finally{clearTimeout(timer);if(this.chatAbort===controller){this.chatAbort=null;this.submitting=false;this.onSubmitting(false);if(!this.active&&this.handsFreeEnabled)this.queueListening(this.turn,'wake');}}
 }
 async confirmed(result,continueConversation=this.handsFreeEnabled){
  if(continueConversation)this.active=true;
  const message=result.message;
  this.history.push({role:'assistant',text:`Server confirmed ${result.action}: ${message}`});this.history=this.history.slice(-8);
  await this.present({message,speech:{ur:result.action==='request'?'بکنگ کی درخواست محفوظ ہو گئی۔ سیشن شروع کرنے کے لیے اسٹاف کی الگ منظوری ضروری ہے۔':'آپ کی منظوری کے بعد عمل سرور پر مکمل ہو گیا۔ ڈیش بورڈ پر تازہ حالت دیکھیں۔',hi:result.action==='request'?'बुकिंग अनुरोध सेव हो गया। सेशन शुरू करने के लिए स्टाफ की अलग मंजूरी जरूरी है।':'आपकी मंजूरी के बाद कार्रवाई सर्वर पर पूरी हुई। डैशबोर्ड पर स्थिति जांचें।',en:result.action==='request'?'The pending booking request was saved. Staff must separately approve it to start the session.':'The server completed the confirmed action. Check the dashboard; delivery to the device is separate.'},action:continueConversation?'listen':'done'});
 }
}
