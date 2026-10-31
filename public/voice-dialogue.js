const words=new Map(Object.entries({one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fortyfive:45,fifty:50,sixty:60,ek:1,aik:1,do:2,teen:3,char:4,chaar:4,panch:5,paanch:5,che:6,chhe:6,saat:7,aath:8,nau:9,das:10,barah:12,pandra:15,tees:30,saath:60,'ایک':1,'دو':2,'تین':3,'چار':4,'پانچ':5,'چھ':6,'سات':7,'آٹھ':8,'نو':9,'دس':10,'بارہ':12,'پندرہ':15,'تیس':30,'ساٹھ':60,'एक':1,'दो':2,'तीन':3,'चार':4,'पांच':5,'पाँच':5,'छह':6,'सात':7,'आठ':8,'नौ':9,'दस':10,'तीस':30,'साठ':60}));
const unit='(?:hours?|hrs?|ghant(?:a|ay|e|ey)?|گھنٹ[ہھےے]|گھنٹے|گھنٹہ|घंटे|घंटा|घण्टे)';
const minuteUnit='(?:minutes?|mins?|منٹ|मिनट)';
function digits(text){return String(text).normalize('NFKC').replace(/[٠-٩۰-۹०-९]/g,c=>String(c.charCodeAt(0)-(c>='०'&&c<='९'?0x966:c>='۰'&&c<='۹'?0x6f0:0x660)));}
function normalize(text){
 let t=digits(text).toLowerCase().replace(/[،,!?؟]/g,' ').replace(/پی\s*سی|पी\s*सी|کمپیوٹر|कंप्यूटर/g,'pc');
 t=t.replace(/(twenty|thirty|forty|fifty|sixty)[ -](one|two|three|four|five|six|seven|eight|nine)/g,(_,a,b)=>String(words.get(a)+words.get(b)));
 t=t.replace(/(one|two|three|four|five|\d+) and (?:a )?half/g,(_,a)=>String((words.get(a)||Number(a))+0.5));
 t=t.replace(/one and a half|one and half|derh|dedh|ڈیڑھ|डेढ़/g,'1.5').replace(/half an? hour|half hour/g,'0.5 hour').replace(/aadha|adha|آدھا|آدھے|आधा/g,'0.5');
 return t.split(/(\s+)/).map(w=>words.has(w)?String(words.get(w)):w).join('').replace(/\s+/g,' ').trim();
}
export function parseBookingSpeech(text){
 const t=normalize(text),ps=/(?:ps\s*5|play\s*station|پلے\s*اسٹیشن|प्ले\s*स्टेशन)/i.test(t);
 const match=t.match(new RegExp(`(?:pc|computer|station|ps\\s*5|play\\s*station|پلے\\s*اسٹیشن|प्ले\\s*स्टेशन)\\s*(?:number|no\\.?|نمبر|नंबर)?\\s*(\\d+)(?!\\d)(?!\\s*(?:${unit}|${minuteUnit}))`,'i'));
 let minutes=0,found=false;
 for(const m of t.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${unit}|${minuteUnit})(?![a-z])`,'gi'))){found=true;minutes+=Number(m[1])*(new RegExp(`^${minuteUnit}$`,'i').test(m[2])?1:60);}
 return {stationNumber:match?Number(match[1]):null,device:match?Number(match[1])+(ps?10:0):null,kind:ps?'PS5':'PC',minutes:found?minutes:null};
}
const cancellation=t=>/(?:^|\s)(?:cancel|stop|no|nope|nahi|nahin|mat|نہیں|منسوخ|نہ|नहीं|नही|रद्द)(?:\s|$|[.!،])/i.test(t);
const confirmation=t=>/^(?:yes|yeah|yep|confirm|haan|han|ha|ji|jee|ہاں|جی|हाँ|हां)(?:\s+(?:please|confirm|booking|request|book|kar|karo|do|dein|karain|kardein|karlo|karna|hai|karein|جی|کر|دو|دیں|کریں|ہاں|हाँ|कर|दो))*[.!۔]?$/iu.test(t.trim());
const prompt=(message,en,ur,hi,action='listen')=>({message,speech:{en,ur,hi},action});
export class VoiceBookingDialogue{
 constructor(devices,name='Maya'){this.name=String(name||'Maya').slice(0,30);this.devices=devices;this.draft={device:null,minutes:null,customer:''};this.phase='device';this.kind='PC';}
 start(){return prompt(`Hi! Main ${this.name} hoon. Kaunsa PC book karna hai?`,`Hi! I'm ${this.name}. Which PC would you like to book?`,`ہائے! میں ${this.name} ہوں۔ کون سا پی سی بک کرنا ہے؟`,`हाय! मैं ${this.name} हूँ। कौन सा पीसी बुक करना है?`);}
 next(){
  const d=this.devices.find(d=>d.id===this.draft.device);
  if(!d||d.kind!==this.kind){this.phase='device';return prompt(this.kind==='PS5'?'Available PS5 ka number batayein.':'Available PC ka number batayein.','Please tell me the station number. For example, PC number five.','براہ کرم اسٹیشن کا نمبر بتائیں۔ مثلاً پی سی نمبر پانچ۔','कृपया स्टेशन का नंबर बताएं। जैसे पीसी नंबर पांच।');}
  if(d.session){this.draft.device=null;this.phase='device';return prompt(`${d.name} busy hai. Koi doosra station batayein.`,`${d.name} is busy. Please choose another station.`,`${d.name} ابھی مصروف ہے۔ کوئی دوسرا اسٹیشن بتائیں۔`,`${d.name} अभी व्यस्त है। दूसरा स्टेशन बताएं।`);}
  if(!Number.isInteger(this.draft.minutes)||this.draft.minutes<5||this.draft.minutes>720){this.draft.minutes=null;this.phase='duration';return prompt(`${d.name} free hai. Kitni der? Misal: one hour ya thirty minutes.`,`${d.name} is available. How long? For example, one hour or thirty minutes.`,`${d.name} خالی ہے۔ کتنی دیر کے لیے؟ مثلاً ایک گھنٹہ یا تیس منٹ۔`,`${d.name} खाली है। कितनी देर के लिए? जैसे एक घंटा या तीस मिनट।`);}
  if(!this.draft.customer){this.phase='customer';return prompt(`${d.name}, ${this.draft.minutes} minutes. Customer ka naam kya hai?`,`${d.name}, for ${this.draft.minutes} minutes. What is the customer's name?`,`${d.name}، ${this.draft.minutes} منٹ۔ کسٹمر کا نام کیا ہے؟`,`${d.name}, ${this.draft.minutes} मिनट। ग्राहक का नाम क्या है?`);}
  this.phase='confirm';this.rate=d.rate;const bill=Math.round(this.draft.minutes/60*d.rate),name=this.draft.customer;
  return prompt(`${name}: ${d.name}, ${this.draft.minutes} minutes, ${bill} rupay. Request banane ke liye "haan" ya "yes" kahein. PC staff approval ke baad chalega.`,`${name}, ${d.name}, ${this.draft.minutes} minutes. Total ${bill} rupees. Say yes to create the request, or cancel. Staff must separately approve the session.`,`${name}، ${d.name}، ${this.draft.minutes} منٹ، کل ${bill} روپے۔ درخواست بنانے کے لیے ہاں کہیں، یا منسوخ کریں۔ سیشن اسٹاف کی الگ منظوری کے بعد شروع ہوگا۔`,`${name}, ${d.name}, ${this.draft.minutes} मिनट, कुल ${bill} रुपये। अनुरोध बनाने के लिए हाँ कहें या रद्द करें। सेशन स्टाफ की अलग मंजूरी के बाद शुरू होगा।`);
 }
 receive(text){
  if(['submitting','done'].includes(this.phase))return null;
  const raw=digits(text).trim();
  if(cancellation(raw.toLowerCase())){this.phase='done';return prompt('Request cancel kar di. Koi session start nahi hua.','Cancelled. No session was started.','درخواست منسوخ کر دی۔ کوئی سیشن شروع نہیں ہوا۔','अनुरोध रद्द कर दिया। कोई सेशन शुरू नहीं हुआ।','done');}
  if(/(?:^|\s)(?:unlock|approve|discount|free)(?:\s|$)/i.test(raw))return prompt('Main booking request bana sakta hoon. Unlock aur approval staff ke button se honge.','I can create a booking request. Only staff can approve and start the session using the dashboard.','میں بکنگ کی درخواست بنا سکتی ہوں۔ سیشن شروع کرنے کے لیے اسٹاف کو ڈیش بورڈ سے منظوری دینی ہوگی۔','मैं बुकिंग अनुरोध बना सकती हूँ। सेशन शुरू करने के लिए स्टाफ को डैशबोर्ड से मंजूरी देनी होगी।');
  const parsed=parseBookingSpeech(raw);let changed=false;
  if(parsed.device!==null){this.kind=parsed.kind;const named=this.devices.find(d=>d.kind===parsed.kind&&d.name.toLowerCase().replace(/\s+/g,'')===(parsed.kind+parsed.stationNumber).toLowerCase());const fallback=this.devices.find(d=>d.id===parsed.device&&d.kind===parsed.kind);this.draft.device=named?.id??fallback?.id??-1;changed=true;}
  else if(this.phase==='device'){if(parsed.kind==='PS5')this.kind='PS5';const bare=normalize(raw);if(/^\d+$/.test(bare)){const number=Number(bare),named=this.devices.find(d=>d.kind===this.kind&&d.name.toLowerCase().replace(/\s+/g,'')===(this.kind+number).toLowerCase());this.draft.device=named?.id??this.devices.find(d=>d.id===number+(this.kind==='PS5'?10:0)&&d.kind===this.kind)?.id??-1;changed=true;}}
  if(parsed.minutes!==null){this.draft.minutes=parsed.minutes;changed=true;}
  else if(this.phase==='duration'&&/^\d+$/.test(normalize(raw))){this.draft.minutes=Number(normalize(raw));changed=true;}
  if(this.phase==='confirm'&&!changed){
   if(confirmation(raw)){this.phase='submitting';return {...prompt('Request save ho rahi hai…','Saving your request.','آپ کی درخواست محفوظ کی جا رہی ہے۔','आपका अनुरोध सेव हो रहा है।','submit'),draft:{...this.draft},rate:this.rate};}
   return prompt('Request banane ke liye sirf "haan" ya "yes" kahein. Tabdeeli ke liye naya PC ya duration batayein; band karne ke liye "cancel".','Please say yes to create the request, tell me a new station or duration to change it, or say cancel.','درخواست بنانے کے لیے ہاں کہیں۔ تبدیلی کے لیے نیا اسٹیشن یا وقت بتائیں، یا منسوخ کہیں۔','अनुरोध बनाने के लिए हाँ कहें। बदलने के लिए नया स्टेशन या समय बताएं, या रद्द कहें।');
  }
  if(this.phase==='customer'&&!changed){
   const name=raw.replace(/^(?:customer(?:\s+ka)?\s+(?:name|naam)(?:\s+(?:is|hai))?|my name is|mera naam|کسٹمر کا نام|میرا نام|मेरा नाम|ग्राहक का नाम)\s*/iu,'').replace(/\s+(?:hai|ہے|है)[.!۔]?$/iu,'').trim();
   if(name.length>=1&&name.length<=80&&!confirmation(name)&&!/^\d+$/.test(name))this.draft.customer=name;
  }
  return this.next();
 }
 saved(){this.phase='done';return prompt('Booking request save ho gayi. Ab staff "Approve & start" button dabaye. Session abhi start nahi hua.','Your booking request has been saved. Staff must press Approve and start. The session has not started yet.','بکنگ کی درخواست محفوظ ہو گئی ہے۔ اب اسٹاف منظوری کا بٹن دبائے۔ سیشن ابھی شروع نہیں ہوا۔','बुकिंग अनुरोध सेव हो गया। अब स्टाफ मंजूरी का बटन दबाए। सेशन अभी शुरू नहीं हुआ।','done');}
}
