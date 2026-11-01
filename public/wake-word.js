const normalize=t=>String(t||'').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
export function wakeCommand(text,name='Maya'){
 const target=normalize(name);if(target.length<2||target.length>30||!/^[\p{L}\p{N} -]+$/u.test(target))return null;
 const known={ali:['ali','علی','अली'],maya:['maya','maia','my a','مایا','مایہ','مائیا','माया','माइया'],stella:['stella','سٹیلا','اسٹیلا','استیلا','سٹلا','سٹیلہ','स्टेला','स्टैला'],nexus:['nexus','نیکسس','نکسس','نیک سس','नेक्सस','नेकसस'],jarvis:['jarvis','جاروس','جارویس','जार्विस'],nexa:['nexa','نیکسا','नेक्सा','नेक्सा'],nova:['nova','نووا','नोवा']};
 const aliases=known[target]||[target];
 const speech=String(text||'').normalize('NFKC').replace(/\s+/g,' ').trim();
 for(const alias of aliases){
  const escaped=alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const match=new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`,'iu').exec(speech);
  if(match)return speech.slice(match.index+match[0].length).replace(/^[\s,،.!?:؛-]+/,'').trim();
 }
 return null;
}
export function endsConversation(text){
 const phrase=String(text).normalize('NFKC').toLocaleLowerCase().replace(/[,.!۔،؟?]/g,' ').replace(/\s+/g,' ').trim();
 return /^(?:ok thanks|okay thanks|ok thank you|okay thank you|اوکے تھینکس|اوکے تھینک یو|ओके थैंक्स|ओके थैंक यू)$/u.test(phrase);
}

export function disablesHandsFree(text){
 const phrase=String(text||'').normalize('NFKC').toLocaleLowerCase().replace(/[,.!۔،؟?-]/g,' ').replace(/\s+/g,' ').trim();
 return /^(?:hands ?free off|turn off hands ?free|hands ?free band|ہینڈز ?فری آف|ہینڈ ?فری بند|ہینڈز ?فری بند|हैंड्स फ्री ऑफ|हैंड्स फ्री बंद)$/u.test(phrase);
}
