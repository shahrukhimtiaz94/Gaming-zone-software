import {getFirebaseAdminApp} from './admin.js';
const speechError=(code,message,status=503)=>Object.assign(new Error(message),{code,status,expose:true});
export function chooseUrduFemaleVoice(voices,preferred=''){
 const matches=voices.filter(v=>v.ssmlGender==='FEMALE'&&v.languageCodes?.some(l=>l.toLowerCase().startsWith('ur-')));
 const rank=v=>/chirp/i.test(v.name)?4:/neural/i.test(v.name)?3:/wavenet/i.test(v.name)?2:1;
 const selected=preferred?matches.find(v=>v.name===preferred):matches.sort((a,b)=>rank(b)-rank(a))[0];
 if(!selected)throw speechError('URDU_FEMALE_VOICE_UNAVAILABLE','Google par Urdu female voice available nahi mili. Browser voice use karein ya voice configuration check karein.');
 return {name:selected.name,languageCode:selected.languageCodes.find(l=>l.toLowerCase().startsWith('ur-')),ssmlGender:'FEMALE'};
}
export function googleSpeechFailure(payload){
 const reasons=(payload?.error?.details||[]).map(d=>d.reason);
 if(reasons.includes('SERVICE_DISABLED'))return speechError('TTS_API_DISABLED','Google Cloud Text-to-Speech API enable karein aur Vercel par redeploy karein.');
 if(reasons.some(r=>/BILLING/.test(r)))return speechError('TTS_BILLING_REQUIRED','Google Cloud project ki billing enable/check karein.');
 if(payload?.error?.code===429)return speechError('TTS_QUOTA_EXCEEDED','Google voice quota poori ho gayi. Browser voice use karein ya kuch der baad try karein.',429);
 return speechError('TTS_ACCESS_UNAVAILABLE','Google Urdu voice access nahi mila. Text-to-Speech API, billing aur service account permissions check karein.');
}
export function createGoogleSpeech({fetcher=globalThis.fetch,credential=()=>getFirebaseAdminApp().options.credential,voiceName=()=>process.env.URDU_VOICE_NAME||''}={}){
 let selected,expires=0;
 return async text=>{
  if(typeof text!=='string'||!text.trim()||Buffer.byteLength(text,'utf8')>4000)throw speechError('INVALID_SPEECH_TEXT','Voice text 1 se 4000 UTF-8 bytes rakhein.',400);
  let access_token;try{({access_token}=await credential().getAccessToken());}catch{throw speechError('TTS_CREDENTIAL_MISSING','Voice ke liye Firebase service account credentials/access check karein.');}
  if(!access_token)throw speechError('TTS_CREDENTIAL_MISSING','Firebase service account ki server credentials check karein.');
  const headers={Authorization:`Bearer ${access_token}`,'Content-Type':'application/json'};
  if(!selected||Date.now()>expires){
   const response=await fetcher('https://texttospeech.googleapis.com/v1/voices?languageCode=ur-IN',{headers,signal:AbortSignal.timeout(8000)});
   const body=await response.json();if(!response.ok)throw googleSpeechFailure(body);
   selected=chooseUrduFemaleVoice(body.voices||[],voiceName());expires=Date.now()+1800000;
  }
  const response=await fetcher('https://texttospeech.googleapis.com/v1/text:synthesize',{method:'POST',headers,signal:AbortSignal.timeout(10000),body:JSON.stringify({input:{text},voice:selected,audioConfig:{audioEncoding:'MP3'}})});
  const result=await response.json();if(!response.ok)throw googleSpeechFailure(result);
  if(typeof result.audioContent!=='string'||!result.audioContent)throw speechError('TTS_AUDIO_MISSING','Voice audio nahi mili. Browser voice use karein.');
  return {audioContent:result.audioContent,mimeType:'audio/mpeg',voice:selected.name,language:selected.languageCode};
 };
}
export const synthesizeUrdu=createGoogleSpeech();
