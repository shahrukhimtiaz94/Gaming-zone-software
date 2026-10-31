import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseUrduFemaleVoice,createGoogleSpeech,googleSpeechFailure} from '../firebase/speech.js';

test('voice selection requires Urdu and FEMALE metadata, preferring natural models',()=>{
 const voices=[
  {name:'en-US-Chirp-Test',languageCodes:['en-US'],ssmlGender:'FEMALE'},
  {name:'ur-IN-Chirp-MaleTest',languageCodes:['ur-IN'],ssmlGender:'MALE'},
  {name:'ur-IN-Standard-Test',languageCodes:['ur-IN'],ssmlGender:'FEMALE'},
  {name:'ur-IN-Wavenet-Test',languageCodes:['ur-IN'],ssmlGender:'FEMALE'}
 ];
 assert.equal(chooseUrduFemaleVoice(voices).name,'ur-IN-Wavenet-Test');
 assert.throws(()=>chooseUrduFemaleVoice(voices,'ur-IN-Chirp-MaleTest'),e=>e.code==='URDU_FEMALE_VOICE_UNAVAILABLE');
 assert.throws(()=>chooseUrduFemaleVoice(voices.slice(0,2)),e=>e.code==='URDU_FEMALE_VOICE_UNAVAILABLE');
});
test('synthesis sends Urdu as text, caches the voice list and never returns credentials',async()=>{
 const calls=[];
 const synth=createGoogleSpeech({credential:()=>({getAccessToken:async()=>({access_token:'test-only-token'})}),fetcher:async(url,options)=>{
  calls.push({url,options});return {ok:true,json:async()=>url.includes('/voices?')?{voices:[{name:'ur-IN-Wavenet-Test',languageCodes:['ur-IN'],ssmlGender:'FEMALE'}]}:{audioContent:'VGVzdA=='}};
 }});
 const result=await synth('السلام علیکم');await synth('کسٹمر کا نام کیا ہے؟');
 assert.equal(calls.length,3);assert.equal(result.mimeType,'audio/mpeg');assert.equal(result.language,'ur-IN');assert.ok(!JSON.stringify(result).includes('test-only-token'));
 const body=JSON.parse(calls[1].options.body);assert.deepEqual(body.input,{text:'السلام علیکم'});assert.equal(body.voice.ssmlGender,'FEMALE');assert.equal(body.audioConfig.audioEncoding,'MP3');
 await assert.rejects(synth('ا'.repeat(3000)),e=>e.status===400);
});
test('API-disabled and credential failures produce safe setup instructions',async()=>{
 assert.equal(googleSpeechFailure({error:{details:[{reason:'SERVICE_DISABLED'}]}}).code,'TTS_API_DISABLED');
 const synth=createGoogleSpeech({credential:()=>{throw Error('secret-key-material');}});
 await assert.rejects(synth('سلام'),e=>e.code==='TTS_CREDENTIAL_MISSING'&&!e.message.includes('secret-key-material'));
});
