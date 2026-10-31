import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { parse } from 'pg-connection-string';

const context = new AsyncLocalStorage();
const firestoreMode = process.env.DATABASE_PROVIDER === 'firestore';
const firebase = firestoreMode ? await import('./firebase/storage.js') : null;
const remote = !firestoreMode && Boolean(process.env.DATABASE_URL);
if (process.env.VERCEL && !remote && !firestoreMode) throw new Error('DATABASE_URL is required on Vercel unless DATABASE_PROVIDER=firestore; local SQLite is not persistent there.');
let sqlite, pool, initialization;
let queue = Promise.resolve();
if (remote) {
  pg.types.setTypeParser(20, Number); // application IDs and millisecond timestamps fit safe integers
  const config = parse(process.env.DATABASE_URL);
  const loopback = ['localhost','127.0.0.1','::1'].includes(config.host);
  const localTest = !process.env.VERCEL && loopback && new URL(process.env.DATABASE_URL).searchParams.get('sslmode') === 'disable';
  // Do not inherit sslmode=require's permissive verification. Production always verifies TLS.
  config.ssl = localTest ? false : { ...(typeof config.ssl === 'object' ? config.ssl : {}), rejectUnauthorized: true };
  pool = new pg.Pool({ ...config, max: 3, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 });
  pool.on('error', () => console.error('Database pool connection error'));
} else if (!firestoreMode) {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = process.env.DATA_DIR || fileURLToPath(new URL('./data', import.meta.url));
  mkdirSync(dir, { recursive: true });
  sqlite = new DatabaseSync(`${dir}/zone.db`);
  sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
}
async function exclusive(fn) {
  const previous = queue;
  let release;
  queue = new Promise(resolve => { release = resolve; });
  await previous;
  try { return await fn(); } finally { release(); }
}
function placeholders(sql) { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); }
async function query(sql, values = [], mode = 'all') {
  const client = context.getStore();
  if (remote) {
    // Fully qualify only our tables: a dedicated schema avoids touching existing app tables.
    sql = sql.replace(/\bend\b/g, '"end"');
    sql = sql.replace(/\b(users|tokens|devices|requests|sessions|agents|audit|login_attempts|assistant_actions)\b/g, 'nexus_zone.$1');
    const insert = mode === 'run' && /^INSERT INTO (?:nexus_zone\.)?(users|devices|requests|sessions|audit)\b/i.test(sql);
    if (insert) sql += ' RETURNING id';
    const result = await (client || pool).query(placeholders(sql), values);
    if (mode === 'run') return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
    return mode === 'get' ? result.rows[0] : result.rows;
  }
  const execute = () => {
    const statement = sqlite.prepare(sql);
    return statement[mode](...values);
  };
  return client ? execute() : exclusive(execute);
}
export const get = (sql, ...values) => firebase ? firebase.get(sql,...values) : query(sql, values, 'get');
export const all = (sql, ...values) => firebase ? firebase.all(sql,...values) : query(sql, values, 'all');
export const run = (sql, ...values) => firebase ? firebase.run(sql,...values) : query(sql, values, 'run');
export async function tx(fn) {
  if (firebase) return firebase.tx(fn);
  if (context.getStore()) return fn();
  if (remote) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Serialize small-zone financial/booking mutations across all serverless instances.
      await client.query('SELECT pg_advisory_xact_lock(72702219)');
      const result = await context.run(client, fn);
      await client.query('COMMIT');
      return result;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
  return exclusive(async () => {
    sqlite.exec('BEGIN IMMEDIATE');
    try { const result = await context.run(sqlite, fn); sqlite.exec('COMMIT'); return result; }
    catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  });
}
async function initialize() {
  await tx(async () => {
    if (remote) await context.getStore().query('CREATE SCHEMA IF NOT EXISTS nexus_zone');
    const id = remote ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
    const time = remote ? 'BIGINT' : 'INTEGER';
    const real = remote ? 'DOUBLE PRECISION' : 'REAL';
    const definitions = [
      `users(id ${id}, name TEXT UNIQUE, role TEXT, salt TEXT, hash TEXT)`,
      `tokens(token TEXT PRIMARY KEY,user_id INTEGER,expires ${time})`,
      'devices(id INTEGER PRIMARY KEY,name TEXT,kind TEXT,rate INTEGER)',
      `requests(id ${id},device_id INTEGER,customer TEXT,minutes INTEGER,status TEXT DEFAULT 'pending',created ${time})`,
      `sessions(id ${id},device_id INTEGER,customer TEXT,start ${time},end ${time},stopped ${time},rate INTEGER,approved_by INTEGER,paid INTEGER DEFAULT 0)`,
      `agents(device_id INTEGER PRIMARY KEY,key_hash TEXT NOT NULL,last_seen ${time},state TEXT,version TEXT)`,
      `audit(id ${id},time ${time},actor TEXT,action TEXT)`,
      `login_attempts(identity TEXT PRIMARY KEY,attempts INTEGER,window_start ${time})`,
      `assistant_actions(id TEXT PRIMARY KEY,user_id INTEGER,action TEXT,payload TEXT,expires ${time},consumed INTEGER DEFAULT 0)`
    ];
    for (let definition of definitions) {
      // END is reserved in PostgreSQL; keep API and SQLite names consistent with quoted SQL.
      if (remote) definition = definition.replace(/\bend\b/g, '"end"');
      const sql = `CREATE TABLE IF NOT EXISTS ${definition}`;
      if (remote) await context.getStore().query(sql.replace(/^(CREATE TABLE IF NOT EXISTS )/, '$1nexus_zone.'));
      else sqlite.exec(sql);
    }
    async function columns(table) {
      if (!remote) return sqlite.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
      const result = await context.getStore().query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', ['nexus_zone', table]);
      return result.rows.map(c => c.column_name);
    }
    for (const name of ['session_id','session_end']) {
      if (!(await columns('agents')).includes(name)) {
        if (remote) await context.getStore().query(`ALTER TABLE nexus_zone.agents ADD COLUMN ${name} ${time}`);
        else sqlite.exec(`ALTER TABLE agents ADD COLUMN ${name} INTEGER`);
      }
    }
    if (!(await columns('sessions')).includes('paid_amount')) {
      if (remote) await context.getStore().query(`ALTER TABLE nexus_zone.sessions ADD COLUMN paid_amount ${real} NOT NULL DEFAULT 0`);
      else sqlite.exec('ALTER TABLE sessions ADD COLUMN paid_amount REAL NOT NULL DEFAULT 0');
      await run('UPDATE sessions SET paid_amount=(end-start)/3600000.0*rate WHERE paid=1');
    }
    if (!(await get('SELECT id FROM devices LIMIT 1'))) {
      for (let i = 1; i <= 12; i++) await run('INSERT INTO devices(id,name,kind,rate) VALUES(?,?,?,?)', i, i <= 10 ? `PC ${i}` : `PS5 ${i-10}`, i <= 10 ? 'PC' : 'PS5', i <= 10 ? 300 : 500);
    }
  });
}
export async function ready() {
  if (firebase) return firebase.ready();
  if (!initialization) initialization = initialize().catch(e => { initialization = null; throw e; });
  return initialization;
}
