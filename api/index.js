import { randomBytes } from 'node:crypto';
// Keep import-time configuration/module failures inside the HTTP boundary.
let application;
export default async function handler(req,res){
 try{
  application ||= import('../server.js').catch(error=>{application=null;throw error;});
  return await (await application).default(req,res);
 }catch(error){
  const reference=randomBytes(6).toString('hex');
  console.error('Application startup failed:',JSON.stringify({reference,code:typeof error.code==='string'?error.code:'APP_STARTUP_FAILED'}));
  if(res.headersSent){res.end();return;}
  res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});
  res.end(JSON.stringify({error:'Server start nahi ho saka. Vercel deployment aur database environment variables check karein.',code:'APP_STARTUP_FAILED',reference}));
 }
}
