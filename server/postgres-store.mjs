import {createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {Pool} from 'pg';
import {attachDatabasePool} from '@vercel/functions';
import {AssistantError} from './vendor/pagesquire.mjs';

const fail=(code,message,status=503)=>{throw new AssistantError(code,message,status);};
const hash=value=>createHash('sha256').update(value).digest('hex');
const pools=new Map();
// Supavisor uses Supabase's private CA, absent from the public Node trust store.
// This public CA is scoped to the official shared pooler hostname, never installed globally.
const supabaseCa=readFileSync(new URL('./certs/supabase-prod-ca-2021.crt',import.meta.url),'utf8');

// Build explicit fields so pg connection-string SSL options cannot disable certificate checks.
export function postgresPoolOptions(connectionString){
  let url;try{url=new URL(connectionString);}catch{fail('INVALID_STORE','Isi DATABASE_URL dengan connection string PostgreSQL Transaction Pooler.');}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password||url.hash||!/^\/[^/]+$/.test(url.pathname))fail('INVALID_STORE','DATABASE_URL PostgreSQL belum valid.');
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname),mode=url.searchParams.get('sslmode');
  if([...url.searchParams.keys()].some(key=>key!=='sslmode')||(mode&&!['require','verify-ca','verify-full',...(local?['disable']:[])].includes(mode)))fail('INVALID_STORE','Gunakan connection string pooler dengan sslmode=require atau verify-full.');
  try{return {
    host:url.hostname.replace(/^\[|\]$/g,''),port:Number(url.port||5432),user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database:decodeURIComponent(url.pathname.slice(1)),
    ssl:local&&mode==='disable'?false:{rejectUnauthorized:true,...(/^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname)?{ca:supabaseCa}:{})},
    max:2,connectionTimeoutMillis:5000,idleTimeoutMillis:5000,query_timeout:8000,allowExitOnIdle:true,application_name:'kabarin-pagesquire'
  };}catch{fail('INVALID_STORE','Encoding DATABASE_URL belum valid.');}
}

function sharedPool(url){
  const options=postgresPoolOptions(url);
  const key=hash(url);if(pools.has(key))return pools.get(key);
  const pool=new Pool(options);
  // Pool errors contain host/user details; never send raw errors to the browser or logs.
  pool.on('error',()=>{});attachDatabasePool(pool);pools.set(key,pool);return pool;
}

/** Durable checkpoints with short autocommit queries, compatible with transaction pooling.
 * transaction() is a logical lease, NOT a SQL transaction spanning a model request.
 */
export class PostgresConversationStore{
  constructor({url,pool,namespace='kabarin:local:v1'}={}){
    if(typeof namespace!=='string'||!namespace||namespace.length>160)fail('INVALID_STORE','Namespace sesi belum valid.');
    this.pool=pool||sharedPool(url);this.namespace=namespace;this.nextCleanup=0;
  }
  async query(text,values){
    try{return await this.pool.query(text,values);}catch(error){
      if(['42P01','3F000'].includes(error.code))fail('STORE_SETUP_REQUIRED','Tabel sesi belum tersedia. Jalankan npm run db:setup setelah mengisi DATABASE_URL.');
      fail('STORE_UNAVAILABLE','Database sesi AI belum tersedia. Periksa DATABASE_URL dan koneksi pooler.');
    }
  }
  async cleanup(){
    if(Date.now()<this.nextCleanup)return;this.nextCleanup=Date.now()+60000;
    try{await this.query(`WITH expired_sessions AS (
      SELECT app_id,session_key FROM kabarin_pagesquire.sessions
      WHERE app_id=$1 AND expires_at<clock_timestamp() AND (locked_until IS NULL OR locked_until<clock_timestamp())
      ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    ), removed_sessions AS (
      DELETE FROM kabarin_pagesquire.sessions s USING expired_sessions e
      WHERE s.app_id=e.app_id AND s.session_key=e.session_key AND s.expires_at<clock_timestamp() AND (s.locked_until IS NULL OR s.locked_until<clock_timestamp()) RETURNING s.session_key
    ), expired_budgets AS (
      SELECT app_id,bucket_key FROM kabarin_pagesquire.rate_limits
      WHERE app_id=$1 AND expires_at<clock_timestamp() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED
    ) DELETE FROM kabarin_pagesquire.rate_limits b USING expired_budgets e
      WHERE b.app_id=e.app_id AND b.bucket_key=e.bucket_key AND b.expires_at<clock_timestamp()`,[this.namespace]);}
    catch(error){this.nextCleanup=0;throw error;}
  }
  async consumeBudget(key,maximum){
    await this.cleanup();
    const {rows}=await this.query(`INSERT INTO kabarin_pagesquire.rate_limits AS b (app_id,bucket_key,request_count,expires_at)
      VALUES ($1,$2,1,clock_timestamp()+interval '60 seconds')
      ON CONFLICT (app_id,bucket_key) DO UPDATE SET
        request_count=CASE WHEN b.expires_at<=clock_timestamp() THEN 1 ELSE LEAST(b.request_count,2147483646)+1 END,
        expires_at=CASE WHEN b.expires_at<=clock_timestamp() THEN clock_timestamp()+interval '60 seconds' ELSE b.expires_at END
      RETURNING request_count`,[this.namespace,hash(key)]);
    if(!Number.isInteger(rows[0]?.request_count)||rows[0].request_count>maximum)fail('RATE_LIMITED','Batas permintaan AI tercapai. Coba sebentar lagi.',429);
  }
  async dailyBudget(key,maximum){
    const {rows}=await this.query(`SELECT CASE WHEN expires_at>clock_timestamp() THEN request_count ELSE 0 END AS used,
      (date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC' AS resets_at
      FROM (SELECT request_count,expires_at FROM kabarin_pagesquire.rate_limits WHERE app_id=$1 AND bucket_key=$2) b
      RIGHT JOIN (SELECT 1) present ON true`,[this.namespace,hash(key)]);
    const used=rows[0]?.used??0;
    if(!Number.isInteger(used)||used<0||!rows[0]?.resets_at)fail('STORE_UNAVAILABLE','Kuota demo belum tersedia.');
    return {limit:maximum,remaining:Math.max(0,maximum-used),resetsAt:new Date(rows[0].resets_at).toISOString(),timezone:'UTC'};
  }
  /** One atomic shared counter, charged before work; failures are never refunded. */
  async consumeDailyBudget(key,maximum){
    if(!Number.isInteger(maximum)||maximum<1||maximum>100)fail('INVALID_STORE','Batas demo tidak valid.');
    await this.cleanup();
    const {rows}=await this.query(`INSERT INTO kabarin_pagesquire.rate_limits AS b (app_id,bucket_key,request_count,expires_at)
      VALUES ($1,$2,1,(date_trunc('day',clock_timestamp() AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC')
      ON CONFLICT (app_id,bucket_key) DO UPDATE SET
        request_count=CASE WHEN b.expires_at<=clock_timestamp() THEN 1 ELSE b.request_count+1 END,
        expires_at=CASE WHEN b.expires_at<=clock_timestamp() THEN EXCLUDED.expires_at ELSE b.expires_at END
      WHERE b.expires_at<=clock_timestamp() OR b.request_count<$3
      RETURNING request_count`,[this.namespace,hash(key),maximum]);
    if(!rows.length)fail('DEMO_DAILY_LIMIT','Kuota demo hari ini habis. Coba besok pukul 07.00 WIB; pintasan lokal tetap tersedia.',429);
  }
  async transaction(key,operation){
    const sessionKey=hash(key),owner=randomBytes(32).toString('hex'),args=[this.namespace,sessionKey,owner];
    const acquired=await this.query(`INSERT INTO kabarin_pagesquire.sessions AS s (app_id,session_key,lock_owner,locked_until,expires_at)
      VALUES ($1,$2,$3,clock_timestamp()+interval '120 seconds',clock_timestamp()+interval '15 minutes')
      ON CONFLICT (app_id,session_key) DO UPDATE SET lock_owner=EXCLUDED.lock_owner,locked_until=EXCLUDED.locked_until
      WHERE s.locked_until IS NULL OR s.locked_until<=clock_timestamp()
      RETURNING session_key`,args);
    if(!acquired.rowCount)fail('BUSY','Permintaan AI sebelumnya masih berjalan.',409);
    try{return await operation({
      load:async()=>{
        const result=await this.query(`SELECT CASE WHEN expires_at>clock_timestamp() THEN payload ELSE NULL END AS payload
          FROM kabarin_pagesquire.sessions WHERE app_id=$1 AND session_key=$2 AND lock_owner=$3 AND locked_until>clock_timestamp()`,args);
        if(!result.rowCount)fail('BUSY','Sesi sedang diproses oleh permintaan lain.',409);
        const value=result.rows[0].payload;
        if(value!==null&&(typeof value!=='object'||Array.isArray(value)||Buffer.byteLength(JSON.stringify(value))>2097152))fail('INVALID_STORE','Sesi AI tidak valid.');
        return value;
      },
      save:async value=>{
        let data;try{data=JSON.stringify(value);}catch{fail('INVALID_STORE','Sesi AI tidak valid.');}
        if(typeof data!=='string'||Buffer.byteLength(data)>2097152)fail('INVALID_STORE','Batas sesi AI tercapai.');
        const result=await this.query(`UPDATE kabarin_pagesquire.sessions SET payload=$4::jsonb,expires_at=clock_timestamp()+interval '15 minutes'
          WHERE app_id=$1 AND session_key=$2 AND lock_owner=$3 AND locked_until>clock_timestamp() RETURNING session_key`,[...args,data]);
        if(!result.rowCount)fail('BUSY','Sesi sedang diproses oleh permintaan lain.',409);
      }
    });}finally{
      // Never release another worker's lease, including after our lease has expired.
      await this.query(`UPDATE kabarin_pagesquire.sessions SET lock_owner=NULL,locked_until=NULL
        WHERE app_id=$1 AND session_key=$2 AND lock_owner=$3`,args).catch(()=>{});
    }
  }
}
