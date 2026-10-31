// Match the index-specific precondition only. Do not conceal permission/network failures.
export function isMissingIndex(error) {
 return (error?.code===9||error?.code==='failed-precondition') && /(?:requires? an? index|index.*(?:required|building|not ready)|no matching index)/i.test(String(error.message||''));
}
export async function withIndexFallback(primary,fallback){
 try{return await primary();}
 catch(error){if(!fallback||!isMissingIndex(error))throw error;return fallback();}
}
export function boundedIndexFallback(snapshot,limit=5000){
 if(snapshot.docs.length>limit){
  throw Object.assign(new Error('Firestore indexes deploy karein: per-PC history fallback ki limit poori ho gayi hai.'),{status:503,expose:true,code:'FIRESTORE_INDEX_REQUIRED'});
 }
 return snapshot;
}
