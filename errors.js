import { isMissingIndex } from './firebase/index-fallback.js';
export function describeError(error){
 if(error.expose===true&&Number.isInteger(error.status))return {status:error.status,error:error.message,...(error.code?{code:error.code}:{})};
 if(isMissingIndex(error))return {status:503,code:'FIRESTORE_INDEX_REQUIRED',error:'Firestore index missing ya abhi building hai. Firebase Console ke Indexes tab ko check karein.'};
 if(error.code===7||error.code===16||error.code==='permission-denied'||error.code==='unauthenticated')return {status:503,code:'FIREBASE_ACCESS_DENIED',error:'Firebase server access denied. Vercel ki service account credentials aur Firestore permissions check karein.'};
 if(error.code===5||error.code==='not-found')return {status:503,code:'FIREBASE_DATABASE_NOT_FOUND',error:'Firestore project ya database nahi mila. FIREBASE_PROJECT_ID aur database settings check karein.'};
 return {status:503,code:'DATABASE_UNAVAILABLE',error:'Server/database unavailable; dobara try karein.'};
}
// Firebase supplies a console link for missing indexes. Log that link, never raw exception text.
export function indexConsoleLink(error){
 if(!isMissingIndex(error))return undefined;
 return String(error.message).match(/https:\/\/console\.firebase\.google\.com\/[^\s<>"']+/)?.[0];
}
