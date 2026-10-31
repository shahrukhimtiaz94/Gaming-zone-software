// Platform failures may be plain text/HTML; never display their raw body.
export async function readApiResponse(response){
 const text=await response.text();
 let value;
 try{value=JSON.parse(text);}catch{
  const timeout=response.status===504;
  throw Object.assign(new Error(timeout?'Server ne waqt par jawab nahi diya. Dobara try karein. (SERVER_TIMEOUT)':'Server se valid jawab nahi mila. Vercel Runtime Logs check karein. (SERVER_RESPONSE_INVALID) HTTP '+response.status),{code:timeout?'SERVER_TIMEOUT':'SERVER_RESPONSE_INVALID',status:response.status});
 }
 if(!value||typeof value!=='object'||Array.isArray(value))throw Object.assign(new Error('Server ka jawab valid nahi. (SERVER_RESPONSE_INVALID)'),{code:'SERVER_RESPONSE_INVALID',status:response.status});
 if(!response.ok)throw Object.assign(new Error([value.error||'Request fail hui.',value.code?'('+value.code+')':'',value.reference?'Ref: '+value.reference:''].filter(Boolean).join(' ')),{code:value.code,status:response.status});
 return value;
}
