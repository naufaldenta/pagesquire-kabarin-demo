import {test} from 'node:test';
import assert from 'node:assert/strict';
import {X509Certificate} from 'node:crypto';
import {postgresPoolOptions,PostgresConversationStore} from '../server/postgres-store.mjs';
import {createConversationStore} from '../server/conversation-store.mjs';
import {createAssistantHost} from '../server/assistant.mjs';

const url='postgresql://postgres.example:fake%40password@aws-0-example.pooler.supabase.com:6543/postgres?sslmode=require';
test('Pooler URI supplies all connection credentials with strict TLS and a bounded pool',()=>{
  const config=postgresPoolOptions(url);assert.equal(config.port,6543);assert.equal(config.user,'postgres.example');assert.equal(config.password,'fake@password');assert.equal(config.database,'postgres');
  assert.equal(config.ssl.rejectUnauthorized,true);assert.equal(config.max,2);assert.ok(config.connectionTimeoutMillis<=5000);assert.ok(config.query_timeout<=8000);assert.equal(config.connectionString,undefined);
  assert.equal(postgresPoolOptions('postgresql://test:fake@127.0.0.1:5432/test?sslmode=disable').ssl,false);
  for(const value of ['', 'https://project.supabase.co',url.replace('require','disable'),url+'&sslcert=bad',url.replace('fake%40password','fake%GGpassword')])assert.throws(()=>postgresPoolOptions(value),error=>error.code==='INVALID_STORE');
});
test('DATABASE_URL alone chooses PostgreSQL; an explicit broken PostgreSQL setting never falls back to Redis',()=>{
  const store=createConversationStore({DATABASE_URL:url,VERCEL_ENV:'preview'});assert.ok(store instanceof PostgresConversationStore);assert.equal(store.namespace,'kabarin:preview:v1');
  assert.throws(()=>createConversationStore({PAGESQUIRE_STORE:'postgres',UPSTASH_REDIS_REST_URL:'https://example.upstash.io',UPSTASH_REDIS_REST_TOKEN:'fake'}),error=>error.code==='INVALID_STORE');
  assert.throws(()=>createConversationStore({PAGESQUIRE_STORE:'typo'}),error=>error.code==='INVALID_STORE');
});
test('Only official Supabase poolers trust the bundled CA and keep chain/hostname verification enabled',()=>{
  const options=postgresPoolOptions(url),cert=new X509Certificate(options.ssl.ca);
  assert.equal(cert.ca,true);assert.equal(cert.fingerprint256,'80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
  assert.ok(new Date(cert.validTo).getTime()>Date.now());assert.equal(options.ssl.rejectUnauthorized,true);assert.equal(options.ssl.checkServerIdentity,undefined);
  for(const host of ['postgres.example.org','aws-0-example.pooler.supabase.com.attacker.invalid']){
    const other=postgresPoolOptions(url.replace('aws-0-example.pooler.supabase.com',host));assert.equal(other.ssl.ca,undefined);assert.equal(other.ssl.rejectUnauthorized,true);
  }
});
test('Database failures and missing schema produce safe actionable errors without credentials',async()=>{
  for(const [code,expected]of [['42P01','STORE_SETUP_REQUIRED'],['3F000','STORE_SETUP_REQUIRED'],['ECONNREFUSED','STORE_UNAVAILABLE']]){
    const store=new PostgresConversationStore({pool:{query:async()=>{throw Object.assign(new Error('fake-private-password and private-host'),{code});}}});
    await assert.rejects(store.transaction('key',async()=>{}),error=>error.code===expected&&!error.message.includes('fake-private-password')&&!error.message.includes('private-host'));
  }
});
test('Bootstrap accepts PostgreSQL config without exposing URL; empty URL disables paid chat',async()=>{
  const env={PAGESQUIRE_PROVIDER:'sumopod',PAGESQUIRE_API_KEY:'fake-key',PAGESQUIRE_MODEL:'fake-model',PAGESQUIRE_ORIGIN:'https://portal.example',PAGESQUIRE_ALLOW_REMOTE:'true',PAGESQUIRE_STORE:'postgres',DATABASE_URL:url};
  for(const value of [url,'']){
    const host=createAssistantHost({env:{...env,DATABASE_URL:value}});
    const response=await host(new Request(env.PAGESQUIRE_ORIGIN+'/api/assistant-session'),'session');const body=await response.json();assert.equal(body.configured,Boolean(value));assert.ok(!JSON.stringify(body).includes('fake%40password'));assert.ok(!JSON.stringify(body).includes('pooler.supabase.com'));
  }
});
