// Test process only: emulate production composite-index failures against the real local
// emulator, which normally does not enforce composite indexes. Never load in production.
if(process.env.VERCEL||process.env.DATABASE_PROVIDER!=='firestore'||process.env.FIREBASE_PROJECT_ID!=='demo-nexus-zone-test'||!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Missing-index injection requires the isolated local demo emulator');
const {Query,Transaction}=await import('firebase-admin/firestore');
function composite(ref){const options=ref?._queryOptions;if(!options)return false;const filters=options.filters||options.fieldFilters||[],orders=options.fieldOrders||[];return filters.length>1||orders.length>1||(filters.length>0&&orders.length>0);}
const missing=()=>{console.error('TEST_MISSING_COMPOSITE_INDEX');return Object.assign(new Error('The query requires an index. https://console.firebase.google.com/project/demo-nexus-zone-test/firestore/indexes'),{code:9});};
const queryGet=Query.prototype.get;
Query.prototype.get=function(...args){if(composite(this))return Promise.reject(missing());return queryGet.apply(this,args);};
const transactionGet=Transaction.prototype.get;
Transaction.prototype.get=function(ref,...args){if(composite(ref))return Promise.reject(missing());return transactionGet.call(this,ref,...args);};
