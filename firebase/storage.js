import { AsyncLocalStorage } from 'node:async_hooks';
import { initializeFirestore } from 'firebase-admin/firestore';
import { getFirebaseAdminApp } from './admin.js';
import { withIndexFallback, boundedIndexFallback } from './index-fallback.js';

const scope=new AsyncLocalStorage();
let database;
const root=()=>{
 database ||= initializeFirestore(getFirebaseAdminApp(), {preferRest:!process.env.FIRESTORE_EMULATOR_HOST}, process.env.FIREBASE_DATABASE_ID||'(default)');
 return database.collection('nexus_zone').doc('gaming-zone');
};
const tableRef=table=>root().collection(table);
const keyFields={users:'id',tokens:'token',devices:'id',requests:'id',sessions:'id',agents:'device_id',audit:'id',login_attempts:'identity',assistant_actions:'id'};
const defaults={sessions:{stopped:null,paid:0,paid_amount:0},requests:{status:'pending'},agents:{last_seen:null,state:null,version:null,session_id:null,session_end:null}};
async function snapshot(ref){const c=scope.getStore();return c?c.transaction.get(ref):ref.get();}
async function document(table,key){
 if(key===null||key===undefined||String(key)===''||String(key).includes('/'))return undefined;
 const ref=tableRef(table).doc(String(key));const c=scope.getStore();
 if(c?.writes.has(ref.path))return c.writes.get(ref.path).data;
 if(c?.cache.has(ref.path))return c.cache.get(ref.path);
 const s=await snapshot(ref),data=s.exists?s.data():undefined;c?.cache.set(ref.path,data);return data;
}
function stage(table,key,data){const ref=tableRef(table).doc(String(key));scope.getStore().writes.set(ref.path,{ref,table,data});}
async function rows(table,query,filter=()=>true,sort,limit=Infinity,fallback){
 const s=await withIndexFallback(()=>snapshot(query||tableRef(table)),fallback);const map=new Map(s.docs.map(d=>[d.id,d.data()]));
 for(const item of scope.getStore()?.writes.values()||[])if(item.table===table){if(item.data)map.set(item.ref.id,item.data);else map.delete(item.ref.id);}
 let result=[...map.values()].filter(filter);if(sort)result.sort(sort);return result.slice(0,limit);
}
const desc=(...fields)=>(a,b)=>{for(const f of fields){if(a[f]!==b[f])return b[f]-a[f];}return 0;};

// This dispatcher supports only the app's fixed internal statements. It is not a SQL parser
// and never accepts statements from HTTP requests. Unknown statements fail closed.
export async function all(sql,...v){
 if(sql==='SELECT device_id,last_seen,state,version,session_id,session_end FROM agents'){
  const result=await rows('agents',tableRef('agents').select('device_id','last_seen','state','version','session_id','session_end'));
  return result.map(({device_id,last_seen,state,version,session_id,session_end})=>({device_id,last_seen:last_seen??null,state:state??null,version:version??null,session_id:session_id??null,session_end:session_end??null}));
 }
 if(sql==='SELECT * FROM sessions WHERE stopped IS NULL AND end>?')return rows('sessions',tableRef('sessions').where('end','>',v[0]),r=>r.stopped===null&&r.end>v[0]);
 if(sql==='SELECT * FROM devices ORDER BY id')return rows('devices',tableRef('devices').orderBy('id'),()=>true,(a,b)=>a.id-b.id);
 if(sql==="SELECT * FROM requests WHERE status='pending' ORDER BY id DESC")return rows('requests',tableRef('requests').where('status','==','pending').orderBy('id','desc'),r=>r.status==='pending',desc('id'),Infinity,()=>snapshot(tableRef('requests').where('status','==','pending')));
 if(sql==='SELECT * FROM audit ORDER BY id DESC LIMIT 100')return rows('audit',tableRef('audit').orderBy('id','desc').limit(100),()=>true,desc('id'),100);
 if(sql.startsWith('SELECT sessions.*,users.name AS staff,devices.name AS device ')){
  const sessions=await rows('sessions',tableRef('sessions').orderBy('start','desc').orderBy('id','desc').limit(5000),()=>true,desc('start','id'),5000,()=>snapshot(tableRef('sessions').orderBy('start','desc').limit(5000)));
  const people=new Map(),devices=new Map();
  const person=id=>{if(!people.has(id))people.set(id,document('users',id));return people.get(id);};
  const device=id=>{if(!devices.has(id))devices.set(id,document('devices',id));return devices.get(id);};
  return Promise.all(sessions.map(async s=>({...s,staff:(await person(s.approved_by))?.name||'Unknown',device:(await device(s.device_id))?.name||'Unknown'})));
 }
 throw new Error('Unsupported Firestore list query');
}
export async function get(sql,...v){
 if(sql==='SELECT id FROM users LIMIT 1'){const r=await rows('users',tableRef('users').limit(1));return r[0];}
 if(sql==='SELECT id FROM devices LIMIT 1'){const r=await rows('devices',tableRef('devices').limit(1));return r[0];}
 if(sql==='SELECT * FROM users WHERE name=?'||sql==='SELECT id FROM users WHERE name=?')return (await rows('users',tableRef('users').where('name','==',v[0]).limit(1),r=>r.name===v[0]))[0];
 if(sql.startsWith('SELECT users.* FROM tokens JOIN users')){const t=await document('tokens',v[0]);return t&&t.expires>v[1]?document('users',t.user_id):undefined;}
 if(sql==='SELECT * FROM sessions WHERE device_id=? AND stopped IS NULL AND end>?'){
  const query=tableRef('sessions').where('device_id','==',v[0]).where('stopped','==',null).where('end','>',v[1]).limit(1);
  const fallback=async()=>boundedIndexFallback(await snapshot(tableRef('sessions').where('device_id','==',v[0]).limit(5001)));
  return (await rows('sessions',query,r=>r.device_id===v[0]&&r.stopped===null&&r.end>v[1],undefined,1,fallback))[0];
 }
 if(sql==='SELECT id FROM sessions WHERE device_id=? ORDER BY start DESC,id DESC LIMIT 1'){
  const query=tableRef('sessions').where('device_id','==',v[0]).orderBy('start','desc').orderBy('id','desc').limit(1);
  const fallback=async()=>boundedIndexFallback(await snapshot(tableRef('sessions').where('device_id','==',v[0]).limit(5001)));
  return (await rows('sessions',query,r=>r.device_id===v[0],desc('start','id'),1,fallback))[0];
 }
 if(sql==='SELECT * FROM agents WHERE key_hash=?')return (await rows('agents',tableRef('agents').where('key_hash','==',v[0]).limit(1),r=>r.key_hash===v[0]))[0];
 if(sql==='SELECT device_id FROM agents WHERE device_id=? AND key_hash=?'){const a=await document('agents',v[0]);return a?.key_hash===v[1]?a:undefined;}
 if(sql.startsWith('SELECT last_seen,state,version,session_id,session_end FROM agents')){
  const a=await document('agents',v[0]);return a?{last_seen:a.last_seen,state:a.state,version:a.version,session_id:a.session_id,session_end:a.session_end}:undefined;
 }
 if(sql==="SELECT * FROM requests WHERE id=? AND status='pending'"){const r=await document('requests',v[0]);return r?.status==='pending'?r:undefined;}
 if(sql==="SELECT * FROM devices WHERE id=? AND kind='PC'"){const d=await document('devices',v[0]);return d?.kind==='PC'?d:undefined;}
 const match=sql.match(/^SELECT \* FROM (devices|sessions|login_attempts|assistant_actions) WHERE (id|identity)=\?$/);
 if(match)return document(match[1],v[0]);
 throw new Error('Unsupported Firestore record query');
}
function literal(expr,values,index,row){
 expr=expr.trim();
 if(expr==='?')return values[index.i++];
 if(expr==='NULL')return null;
 if(/^'.*'$/.test(expr))return expr.slice(1,-1);
 if(/^\d+$/.test(expr))return Number(expr);
 const add=expr.match(/^(\w+)\+(\?|\d+)$/);
 if(add)return row[add[1]]+(add[2]==='?'?values[index.i++]:Number(add[2]));
 throw new Error('Unsupported Firestore expression');
}
function conditions(expr,values,index){return expr.split(' AND ').map(part=>{const m=part.match(/^(\w+)=(.+)$/);if(!m)throw new Error('Unsupported Firestore condition');return [m[1],literal(m[2],values,index,{})];});}
export async function run(sql,...v){
 if(!scope.getStore())return tx(()=>run(sql,...v));
 let m=sql.match(/^INSERT INTO (\w+)\(([^)]+)\) VALUES\(([^)]+)\)/);
 if(m){
  const [,table,fields,expressions]=m;if(!keyFields[table])throw new Error('Unknown Firestore table');
  const data={...defaults[table]},index={i:0};const columns=fields.split(',');expressions.split(',').forEach((e,i)=>data[columns[i]]=literal(e,v,index,data));
  if(keyFields[table]==='id'&&data.id===undefined){
   const counters=await document('_meta','counters')||{};
   data.id=(counters[table]||0)+1;stage('_meta','counters',{...counters,[table]:data.id});
  }
  const key=data[keyFields[table]];if(key===undefined)throw new Error('Missing Firestore document key');
  if(sql.includes(' ON CONFLICT(device_id)'))stage(table,key,{...defaults.agents,...data});
  else{if(await document(table,key))throw new Error('Duplicate Firestore record');stage(table,key,data);}
  return {changes:1,lastInsertRowid:data.id};
 }
 m=sql.match(/^UPDATE (\w+) SET (.+) WHERE (.+)$/);
 if(m){
  const [,table,assignments,where]=m;if(!keyFields[table])throw new Error('Unknown Firestore table');
  // Consume SET placeholders before WHERE placeholders, matching SQL call order.
  const index={i:0};const operations=assignments.split(',').map(part=>{const equal=part.indexOf('=');const field=part.slice(0,equal),expr=part.slice(equal+1);const params=[];for(let i=0;i<(expr.match(/\?/g)||[]).length;i++)params.push(v[index.i++]);return {field,expr,params};});
  const predicates=conditions(where,v,index);const key=predicates.find(([f])=>f===keyFields[table])?.[1];if(key===undefined)throw new Error('Missing update key');
  const row=await document(table,key);if(!row||predicates.some(([f,x])=>row[f]!==x))return {changes:0};
  const updated={...row};for(const op of operations)updated[op.field]=literal(op.expr,op.params,{i:0},row);
  stage(table,key,updated);return {changes:1};
 }
 m=sql.match(/^DELETE FROM (\w+) WHERE (\w+)=\?$/);
 if(m&&keyFields[m[1]]===m[2]){const old=await document(m[1],v[0]);if(old)stage(m[1],v[0],undefined);return {changes:old?1:0};}
 throw new Error('Unsupported Firestore mutation');
}
export async function tx(fn){
 if(scope.getStore())return fn();
 root();
 const outcome=await database.runTransaction(async transaction=>{
  const context={transaction,writes:new Map(),cache:new Map()};
  let result;
  try{result=await scope.run(context,fn);}catch(error){
   // Business rejection must discard buffered mutations and finish a read-only commit.
   // The SDK's best-effort asynchronous rollback can leave locks until timeout when
   // a serverless/short-lived caller exits immediately after a rejected transaction.
   if(error.expose)return {error};
   throw error;
  }
  // All reads are complete before staging writes in the Firestore transaction.
  for(const {ref,data} of context.writes.values()){if(data===undefined)transaction.delete(ref);else transaction.set(ref,data);}
  return {result};
 });
 if(outcome.error)throw outcome.error;
 return outcome.result;
}
let initialization;
export function ready(){
 if(!initialization)initialization=(async()=>{
  // Existing deployments need a read, not a schema transaction on every cold start.
  if(await document('_meta','schema'))return;
  await tx(async()=>{
   if(await document('_meta','schema'))return;
   for(let i=1;i<=12;i++)stage('devices',i,{id:i,name:i<=10?`PC ${i}`:`PS5 ${i-10}`,kind:i<=10?'PC':'PS5',rate:i<=10?300:500});
   stage('_meta','schema',{version:1});
  });
 })().catch(e=>{initialization=null;throw e;});
 return initialization;
}
