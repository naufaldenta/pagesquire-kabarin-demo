import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {PostgresConversationStore,postgresPoolOptions} from '../server/postgres-store.mjs';
import {createAssistantHost} from '../server/assistant.mjs';
import {seed} from '../server/news.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(readFileSync(new URL('../integration/capabilities.json',import.meta.url)));
const migration=readFileSync(new URL('../database/kabarin-pagesquire.sql',import.meta.url),'utf8');
let one,two;
before(async()=>{
  // This suite can only run against the disposable cluster started by our runner.
  assert.ok(process.env.PAGESQUIRE_TEST_CLUSTER_DIR,'Run npm run test:postgres; never use a project database.');
  const url=new URL(process.env.PAGESQUIRE_TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.username,'kabarin_test');
  one=new Pool(postgresPoolOptions(url.href));two=new Pool(postgresPoolOptions(url.href));
  const {rows}=await one.query("SELECT current_setting('data_directory') AS directory");
  assert.equal(path.resolve(rows[0].directory),path.resolve(process.env.PAGESQUIRE_TEST_CLUSTER_DIR));
  await one.query("CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA other_project; CREATE TABLE other_project.pagesquire (marker text); INSERT INTO other_project.pagesquire VALUES ('keep-existing-project'); CREATE TABLE public.pagesquire_sessions (marker text); INSERT INTO public.pagesquire_sessions VALUES ('keep-public-table')");
  await one.query(migration);await one.query(migration);
});
after(async()=>{await Promise.all([one?.end(),two?.end()]);});
test('Daily counters atomically permit only five, survive instances, expire at UTC midnight and never store raw identities',async()=>{
  const namespace=randomUUID(),a=new PostgresConversationStore({pool:one,namespace}),b=new PostgresConversationStore({pool:two,namespace});
  assert.equal((await a.dailyBudget('opaque-network',5)).remaining,5);
  const results=await Promise.allSettled(Array.from({length:20},(_,i)=>(i%2?a:b).consumeDailyBudget('opaque-network',5)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,5);assert.ok(results.filter(r=>r.status==='rejected').every(r=>r.reason.code==='DEMO_DAILY_LIMIT'));
  const status=await b.dailyBudget('opaque-network',5);assert.equal(status.remaining,0);assert.match(status.resetsAt,/T00:00:00\.000Z$/);
  const row=(await two.query('SELECT bucket_key,request_count FROM kabarin_pagesquire.rate_limits WHERE app_id=$1',[namespace])).rows[0];assert.match(row.bucket_key,/^[a-f0-9]{64}$/);assert.equal(row.request_count,5);
  await two.query("UPDATE kabarin_pagesquire.rate_limits SET expires_at=clock_timestamp()-interval '1 second' WHERE app_id=$1",[namespace]);
  await b.consumeDailyBudget('opaque-network',5);assert.equal((await a.dailyBudget('opaque-network',5)).remaining,4);
  await assert.rejects(a.consumeDailyBudget('bad',0),e=>e.code==='INVALID_STORE');
});
const store=(namespace,pool=one)=>new PostgresConversationStore({pool,namespace});
const record=value=>({principal:'test-reader',state:{marker:value},rate:{since:Date.now(),count:1}});

test('Migration is repeatable, isolates new tables, enables RLS and preserves other project tables',async()=>{
  assert.equal((await two.query('SELECT marker FROM other_project.pagesquire')).rows[0].marker,'keep-existing-project');
  assert.equal((await two.query('SELECT marker FROM public.pagesquire_sessions')).rows[0].marker,'keep-public-table');
  const grants=await two.query("SELECT has_schema_privilege('anon','kabarin_pagesquire','USAGE') AS anon,has_table_privilege('authenticated','kabarin_pagesquire.sessions','SELECT') AS authenticated");
  assert.deepEqual(grants.rows[0],{anon:false,authenticated:false});
  const flags=await two.query("SELECT relrowsecurity FROM pg_class WHERE oid IN ('kabarin_pagesquire.sessions'::regclass,'kabarin_pagesquire.rate_limits'::regclass)");assert.ok(flags.rows.every(row=>row.relrowsecurity));
});
test('Each checkpoint commits before the operation ends and survives a later provider failure',async()=>{
  const namespace=randomUUID(),a=store(namespace),b=store(namespace,two),key='checkpoint';
  await assert.rejects(a.transaction(key,async tx=>{
    assert.equal(await tx.load(),null);await tx.save(record('attempt-before-provider'));
    const persisted=(await two.query('SELECT payload FROM kabarin_pagesquire.sessions WHERE app_id=$1',[namespace])).rows[0].payload;
    assert.equal(persisted.state.marker,'attempt-before-provider');
    throw new Error('Simulated inference failure after a paid attempt checkpoint');
  }),/Simulated inference/);
  await b.transaction(key,async tx=>assert.equal((await tx.load()).state.marker,'attempt-before-provider'));
});
test('Concurrent workers serialize the same session, while other app/environment namespaces are independent',async()=>{
  const namespace=randomUUID(),a=store(namespace),b=store(namespace,two);let entered,release;
  const entering=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{release=resolve;});
  const running=a.transaction('same-key',async tx=>{entered();await held;await tx.save(record('first'));});await entering;
  try{
    await assert.rejects(b.transaction('same-key',async()=>assert.fail('Concurrent session entered')),error=>error.code==='BUSY');
    await store(namespace+':other-app',two).transaction('same-key',async tx=>{assert.equal(await tx.load(),null);await tx.save(record('other-app'));});
  }finally{release();await running;}
  await b.transaction('same-key',async tx=>assert.equal((await tx.load()).state.marker,'first'));
});
test('An expired owner cannot read, save or release a replacement lease',async()=>{
  const namespace=randomUUID(),a=store(namespace),b=store(namespace,two);let firstTx,releaseFirst;
  let entered;const entering=new Promise(resolve=>{entered=resolve;}),held=new Promise(resolve=>{releaseFirst=resolve;});
  const first=a.transaction('lease-key',async tx=>{firstTx=tx;await tx.save(record('old'));entered();await held;});await entering;
  await two.query("UPDATE kabarin_pagesquire.sessions SET locked_until=clock_timestamp()-interval '1 second' WHERE app_id=$1",[namespace]);
  try{await b.transaction('lease-key',async tx=>{
    await tx.save(record('replacement'));
    await assert.rejects(firstTx.load(),error=>error.code==='BUSY');
    await assert.rejects(firstTx.save(record('corrupted')),error=>error.code==='BUSY');
    releaseFirst();await first;
    assert.equal((await tx.load()).state.marker,'replacement');
    const {rows}=await two.query('SELECT lock_owner FROM kabarin_pagesquire.sessions WHERE app_id=$1',[namespace]);assert.ok(rows[0].lock_owner);
  });}finally{releaseFirst();await first;}
});
test('Expiry hides old history, rate limits are atomic across pools and cleanup respects active/other app rows',async()=>{
  const namespace=randomUUID(),a=store(namespace),b=store(namespace,two);
  await a.transaction('old',tx=>tx.save(record('expired')));
  await two.query("UPDATE kabarin_pagesquire.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE app_id=$1",[namespace]);
  await b.transaction('old',async tx=>assert.equal(await tx.load(),null));
  const budgets=await Promise.allSettled(Array.from({length:12},(_,i)=>(i%2?a:b).consumeBudget('site',5)));
  assert.equal(budgets.filter(value=>value.status==='fulfilled').length,5);
  assert.ok(budgets.filter(value=>value.status==='rejected').every(value=>value.reason.code==='RATE_LIMITED'));
  await two.query("UPDATE kabarin_pagesquire.rate_limits SET expires_at=clock_timestamp()-interval '1 second' WHERE app_id=$1",[namespace]);
  await b.consumeBudget('site',5);
  await store(namespace+':keep',two).transaction('expired-other-app',tx=>tx.save(record('untouched')));
  await two.query("UPDATE kabarin_pagesquire.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE app_id=$1",[namespace+':keep']);
  await a.transaction('active',async tx=>{
    await tx.save(record('active'));
    await two.query("UPDATE kabarin_pagesquire.sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE app_id=$1 AND session_key=$2",[namespace,hash('active')]);
    a.nextCleanup=0;await a.cleanup();
    assert.equal((await two.query('SELECT COUNT(*)::int AS n FROM kabarin_pagesquire.sessions WHERE app_id=$1',[namespace])).rows[0].n,1);
    assert.equal((await two.query('SELECT COUNT(*)::int AS n FROM kabarin_pagesquire.sessions WHERE app_id=$1',[namespace+':keep'])).rows[0].n,1);
  });
});
test('Open/read/summary, replay and reset preserve PageSquire behavior across PostgreSQL instances',async()=>{
  const namespace=randomUUID(),origin='https://portal.example',env={PAGESQUIRE_PROVIDER:'sumopod',PAGESQUIRE_API_KEY:'fake-provider-key',PAGESQUIRE_MODEL:'fake-model',PAGESQUIRE_ORIGIN:origin,PAGESQUIRE_ALLOW_REMOTE:'true'};
  let calls=0;const provider={complete:async()=>{calls++;return {text:'Ringkasan QA sesuai cuplikan.',emotion:'idle',finished:true,toolCalls:[]};}};
  let round=0;const host=()=>createAssistantHost({env,store:store(namespace,round++%2?one:two),provider,service:{catalog:async()=>seed.articles}});
  const request=async(action,body,headers={})=>host()(new Request(origin+'/api/assistant-'+action,{method:action==='session'?'GET':'POST',headers:{origin,'content-type':'application/json',...headers},...(action==='session'?{}:{body:JSON.stringify(body)})}),action);
  const bootstrap=await request('session');const headers={cookie:bootstrap.headers.get('set-cookie').split(';')[0],'x-csrf-token':(await bootstrap.json()).csrfToken};
  const snapshot=(url=origin+'/#')=>({protocolVersion:'0.1',id:randomUUID(),url,title:'Kabarin',text:'Teks publik halaman berita',targets:[],truncated:{text:false,targets:false}});
  const firstBody={protocolVersion:'0.1',requestId:'pg-open-1',message:'Buka satu berita teknologi terbaru lalu telusuri dan rangkum isinya',snapshot:snapshot(),capabilityIds:manifest.capabilities.map(value=>value.id)};
  const firstResponse=await request('chat',firstBody,headers);assert.equal(firstResponse.status,200);const first=await firstResponse.json(),open=first.response.toolCalls[0];assert.equal(open.capabilityId,'news.open_article');
  assert.deepEqual(await(await request('chat',firstBody,headers)).json(),first);
  const arrived=snapshot(origin+'/#artikel/'+open.parameters.articleId);
  const secondBody={...firstBody,message:undefined,requestId:'pg-read-2',conversationId:first.conversationId,snapshot:arrived,result:{protocolVersion:'0.1',callId:open.callId,capabilityId:open.capabilityId,status:'success',code:'VERIFIED',message:'Verified',evidence:{route:'artikel/'+open.parameters.articleId}}};
  const secondResponse=await request('chat',secondBody,headers);assert.equal(secondResponse.status,200);const second=await secondResponse.json(),read=second.response.toolCalls[0];assert.equal(read.capabilityId,'page.read');
  const finalBody={...secondBody,requestId:'pg-summary-3',result:{...secondBody.result,callId:read.callId,capabilityId:read.capabilityId,evidence:{scope:'article',url:arrived.url,text:seed.articles.find(value=>value.id===open.parameters.articleId).summary,truncated:false,nextOffset:null,complete:true}}};
  const finalResponse=await request('chat',finalBody,headers);assert.equal(finalResponse.status,200);const final=await finalResponse.json();assert.equal(final.response.finished,true);assert.match(final.response.text,/Cakupan:/);assert.equal(calls,1);
  assert.deepEqual(await(await request('chat',finalBody,headers)).json(),final);assert.equal(calls,1);
  const before=(await two.query('SELECT payload FROM kabarin_pagesquire.sessions WHERE app_id=$1',[namespace])).rows[0].payload;
  assert.equal((await request('reset',{},headers)).status,200);
  const after=(await two.query('SELECT payload FROM kabarin_pagesquire.sessions WHERE app_id=$1',[namespace])).rows[0].payload;assert.equal(after.state,null);assert.equal(after.rate.count,before.rate.count);
});
test('A failed provider call cannot be paid twice by replaying the same request on another instance',async()=>{
  const namespace=randomUUID(),origin='https://portal.example',env={PAGESQUIRE_PROVIDER:'sumopod',PAGESQUIRE_API_KEY:'fake-provider-key',PAGESQUIRE_MODEL:'fake-model',PAGESQUIRE_ORIGIN:origin,PAGESQUIRE_ALLOW_REMOTE:'true'};
  let calls=0;const provider={complete:async()=>{calls++;throw new Error('Simulated uncertain provider failure');}};
  const first=createAssistantHost({env,store:store(namespace,one),provider,service:{catalog:async()=>seed.articles}});
  const second=createAssistantHost({env,store:store(namespace,two),provider,service:{catalog:async()=>seed.articles}});
  const bootstrap=await first(new Request(origin+'/api/assistant-session'),'session');const cookie=bootstrap.headers.get('set-cookie').split(';')[0],csrf=(await bootstrap.json()).csrfToken;
  const body={protocolVersion:'0.1',requestId:'pg-failed-provider-1',message:'Jelaskan cara menggunakan portal berita ini',snapshot:{protocolVersion:'0.1',id:randomUUID(),url:origin+'/#',title:'Kabarin',text:'Berita publik',targets:[],truncated:{text:false,targets:false}},capabilityIds:manifest.capabilities.map(value=>value.id)};
  const request=()=>new Request(origin+'/api/assistant-chat',{method:'POST',headers:{origin,cookie,'x-csrf-token':csrf,'content-type':'application/json'},body:JSON.stringify(body)});
  const failed=await first(request(),'chat');assert.equal(failed.status,502);assert.equal(calls,1);
  const saved=(await two.query('SELECT payload FROM kabarin_pagesquire.sessions WHERE app_id=$1',[namespace])).rows[0].payload;
  assert.equal(saved.state.attempts,1);assert.equal(saved.state.lastRequest,body.requestId);
  const replay=await second(request(),'chat');assert.equal(replay.status,409);assert.equal((await replay.json()).error.code,'REPLAY_REJECTED');assert.equal(calls,1);
});
