import { isMissingIndex } from './firebase/index-fallback.js';
export function describeError(error){
 if(error.expose===true&&Number.isInteger(error.status))return {status:error.status,error:error.message,...(error.code?{code:error.code}:{})};
 if(isMissingIndex(error))return {status:503,code:'FIRESTORE_INDEX_REQUIRED',error:'Firestore index missing ya abhi building hai. Firebase Console ke Indexes tab ko check karein.'};
 if(error.code===7||error.code===16||error.code==='permission-denied'||error.code==='unauthenticated')return {status:503,code:'FIREBASE_ACCESS_DENIED',error:'Firebase server access denied. Vercel ki service account credentials aur Firestore permissions check karein.'};
 if(error.code===8||error.code==='resource-exhausted')return {status:429,code:'FIREBASE_QUOTA_EXCEEDED',error:'Firestore read/write quota ya rate limit poori ho gayi. Firebase Console ke Usage tab ko check karein. Data delete ya key replace karne se quota reset nahi hoti.'};
 if(error.code===10||error.code==='aborted')return {status:503,code:'FIREBASE_TRANSACTION_BUSY',error:'Firestore transaction busy/aborted hui. Thori der baad dobara try karein.'};
 if(error.code===4||error.code===14||error.code==='deadline-exceeded'||error.code==='unavailable')return {status:503,code:'FIREBASE_TEMPORARILY_UNAVAILABLE',error:'Firestore response timeout ya service temporarily unavailable hai. Connection aur Firebase status check karein.'};
 if(/^Unsupported Firestore (?:list query|record query|mutation|expression|condition)$/.test(error.message||''))return {status:503,code:'FIREBASE_QUERY_UNSUPPORTED',error:'App ki ek database query supported nahi. Error Ref developer ko bhejein; credentials badalne ki zaroorat nahi.'};
 if(error.code===5||error.code==='not-found')return {status:503,code:'FIREBASE_DATABASE_NOT_FOUND',error:'Firestore project ya database nahi mila. FIREBASE_PROJECT_ID aur database settings check karein.'};
 return {status:503,code:'DATABASE_UNAVAILABLE',error:'Server/database unavailable; dobara try karein.'};
}
// Firebase supplies a console link for missing indexes. Log that link, never raw exception text.
export function indexConsoleLink(error){
 if(!isMissingIndex(error))return undefined;
 return String(error.message).match(/https:\/\/console\.firebase\.google\.com\/[^\s<>"']+/)?.[0];
}

export function safeErrorLocation(error){
 const frames=String(error.stack||'').split('\n').slice(1).join('\n');
 return frames.match(/(?:assistant|firebase)\/[a-zA-Z0-9_.-]+\.js:\d+:\d+|server\.js:\d+:\d+/)?.[0];
}
