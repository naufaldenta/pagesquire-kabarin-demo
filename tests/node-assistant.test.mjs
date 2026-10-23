import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createAssistantHost} from '../server/assistant.mjs';
import {RedisConversationStore} from '../server/redis-store.mjs';
import {navigationIntent,readingIntent} from '../server/intents.mjs';
import {seed} from '../server/news.mjs';
import {OpenAiCompatibleProvider} from '../server/vendor/pagesquire.mjs';
import {redisFixture} from './support/redis-fixture.mjs';
const manifest=JSON.parse(readFileSync(new URL('../integration/capabilities.json',import.meta.url)));const ids=manifest.capabilities.map(c=>c.id);
const env={PAGESQUIRE_PROVIDER:'sumopod',PAGESQUIRE_API_KEY:'not-a-real-key',PAGESQUIRE_MODEL:'synthetic-test-model',PAGESQUIRE_ORIGIN:'https://portal.example',PAGESQUIRE_ALLOW_REMOTE:'true'};
const origin=env.PAGESQUIRE_ORIGIN;
const catalog=seed.articles.map(a=>({...a,ageMinutes:Math.max(0,Math.floor((Date.now()-Date.parse(a.date))/60000))}));
const snapshot=(url=origin+'/#',id=randomUUID())=>({protocolVersion:'0.1',id,url,title:'Kabarin',text:'Berita publik dari penerbit',targets:[],truncated:{text:false,targets:false}});
const storeFor=fixture=>new RedisConversationStore({url:'https://unit.upstash.io',token:'unit-test-token',fetcher:fixture.fetcher});
const call=(host,action,body,headers={})=>host(new Request(`${origin}/api/assistant-${action}`,{method:action==='session'?'GET':'POST',headers:{origin,'content-type':'application/json',...headers},...(action==='session'?{}:{body:typeof body==='string'?body:JSON.stringify(body??{})})}),action);
async function session(host){const response=await call(host,'session');const cookie=response.headers.get('set-cookie')?.split(';')[0];const data=await response.json();assert.equal(data.configured,true);assert.ok(cookie);return {cookie,csrf:data.csrfToken};}
const sessionHeaders=value=>({cookie:value.cookie,'x-csrf-token':value.csrf});
function harness(){
  const fixture=redisFixture();let completions=0,prompt=[];const provider={complete:async(messages)=>{completions++;prompt=messages;return {text:'Ringkasan uji: informasi mengikuti cuplikan sumber yang dibaca.',emotion:'happy',finished:true,toolCalls:[]};}};
  // A new host/store object per request emulates independent serverless instances.
  const host=()=>createAssistantHost({env,store:storeFor(fixture),provider,service:{catalog:async()=>catalog}});
  return {fixture,host,provider,get completions(){return completions;},get prompt(){return prompt;}};
}
test('Bootstrap signs HttpOnly secure sessions; missing Redis disables paid chat honestly',async()=>{
  const h=harness();const response=await call(h.host(),'session');const data=await response.json();assert.equal(data.configured,true);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Lax; Max-Age=900; Secure/);assert.ok(!JSON.stringify(data).includes(env.PAGESQUIRE_API_KEY));assert.match(response.headers.get('cache-control'),/no-store/);
  const absent=createAssistantHost({env});const disabled=await(await call(absent,'session')).json();assert.equal(disabled.configured,false);assert.ok(disabled.csrfToken.length>=16);assert.equal((await call(absent,'chat',{})).status,503);
});
test('Foreign origin, cross-site fetch, missing/tampered session and Unicode CSRF are rejected',async()=>{
  const h=harness(),s=await session(h.host()),host=h.host(),headers=sessionHeaders(s);
  assert.equal((await call(host,'session',null,{origin:'https://attacker.invalid'})).status,403);
  assert.equal((await call(host,'session',null,{'sec-fetch-site':'cross-site'})).status,403);
  assert.equal((await call(host,'chat',{})).status,403);
  assert.equal((await call(host,'chat',{}, {...headers,cookie:s.cookie+'x'})).status,403);
  assert.equal((await call(host,'chat',{}, {...headers,'x-csrf-token':'é'.repeat(s.csrf.length)})).status,419);
  assert.equal(h.completions,0);
});
test('Trusted Vercel environment origin works without trusting a request Host header',async()=>{
  const h=harness();const host=createAssistantHost({env:{...env,PAGESQUIRE_ORIGIN:'',VERCEL_URL:'portal.example',VERCEL_ENV:'preview'},store:storeFor(h.fixture),provider:h.provider,service:{catalog:async()=>catalog}});
  assert.equal((await(await call(host,'session',null,{host:'attacker.invalid'})).json()).configured,true);
  const disabled=createAssistantHost({env:{...env,PAGESQUIRE_ALLOW_REMOTE:'false'},store:storeFor(h.fixture)});assert.equal((await(await call(disabled,'session')).json()).configured,false);
});
test('Invalid JSON/schema, content types and methods never call the model',async()=>{
  const h=harness(),s=await session(h.host()),host=h.host(),headers=sessionHeaders(s);
  assert.equal((await call(host,'chat','{broken',headers)).status,422);
  assert.equal((await call(host,'chat',{},headers)).status,422);
  assert.equal((await call(host,'chat',{}, {...headers,'content-type':'text/plain'})).status,415);
  assert.equal((await host(new Request(origin+'/api/assistant-chat',{headers:{origin}}),'chat')).status,405);
  assert.equal(h.completions,0);
});
test('Open/read/summary survives independent Node instances; checkpoint replay is idempotent',async()=>{
  const h=harness(),s=await session(h.host()),headers=sessionHeaders(s);
  const oneRequest={protocolVersion:'0.1',requestId:'node-open-1',message:'Buka satu berita teknologi terbaru lalu telusuri dan rangkum isinya',snapshot:snapshot(),capabilityIds:ids};
  const oneResponse=await call(h.host(),'chat',oneRequest,headers);assert.equal(oneResponse.status,200);const one=await oneResponse.json();const open=one.response.toolCalls[0];assert.equal(open.capabilityId,'news.open_article');assert.equal(h.completions,0);
  const repeated=await(await call(h.host(),'chat',oneRequest,headers)).json();assert.deepEqual(repeated,one);assert.equal(h.completions,0);
  const pending=await call(h.host(),'chat',{...oneRequest,requestId:'node-pending',conversationId:one.conversationId},headers);assert.equal(pending.status,409);
  const arrived=snapshot(origin+'/#artikel/'+open.parameters.articleId);
  const twoRequest={protocolVersion:'0.1',requestId:'node-read-2',conversationId:one.conversationId,snapshot:arrived,capabilityIds:ids,result:{protocolVersion:'0.1',callId:open.callId,capabilityId:open.capabilityId,status:'success',code:'VERIFIED',message:'Article verified',evidence:{route:'artikel/'+open.parameters.articleId}}};
  const twoResponse=await call(h.host(),'chat',twoRequest,headers);assert.equal(twoResponse.status,200);const two=await twoResponse.json();const read=two.response.toolCalls[0];assert.equal(read.capabilityId,'page.read');assert.equal(h.completions,0);
  const request={...twoRequest,requestId:'node-summary-3',result:{...twoRequest.result,callId:read.callId,capabilityId:read.capabilityId,evidence:{scope:'article',url:arrived.url,text:'Cuplikan dari penerbit. PUBLIC REAL READING MARKER: '+catalog.find(a=>a.id===open.parameters.articleId).summary,truncated:false,nextOffset:null,complete:true}}};
  const finalResponse=await call(h.host(),'chat',request,headers);assert.equal(finalResponse.status,200);const final=await finalResponse.json();assert.equal(final.response.finished,true);assert.equal(h.completions,1);assert.match(final.response.text,/Cakupan: Ringkasan berdasarkan cuplikan/);assert.ok(JSON.stringify(h.prompt).includes('PUBLIC REAL READING MARKER'));
  assert.deepEqual(await(await call(h.host(),'chat',request,headers)).json(),final);assert.equal(h.completions,1);
  const before=[...h.fixture.values.values()].map(value=>{try{return JSON.parse(value);}catch{return null;}}).find(value=>value?.state);
  assert.equal((await call(h.host(),'reset',{},headers)).status,200);
  const after=[...h.fixture.values.values()].map(value=>{try{return JSON.parse(value);}catch{return null;}}).find(value=>value?.principal);
  assert.equal(after.state,null);assert.equal(after.rate.count,before.rate.count);assert.ok(h.fixture.commands.some(args=>args[0]==='EVAL'&&args[1].includes("redis.call('SET'")));
});
test('Shared lock serializes instances; stale owners cannot overwrite/release a newer lease',async()=>{
  const fixture=redisFixture(),one=storeFor(fixture),two=storeFor(fixture);let enter,release;const entered=new Promise(resolve=>{enter=resolve;});const held=new Promise(resolve=>{release=resolve;});
  const running=one.transaction('key',async tx=>{enter();await held;await tx.save({principal:'reader',state:null,rate:{since:1,count:1}});});await entered;
  await assert.rejects(two.transaction('key',async()=>{}),error=>error.code==='BUSY');release();await running;
  await one.transaction('key',async tx=>{
    const lock=[...fixture.values.keys()].find(key=>key.endsWith(':lock'));fixture.values.set(lock,'new-owner');
    await assert.rejects(tx.save({state:'should-not-write'}),error=>error.code==='BUSY');
  });
  assert.ok([...fixture.values.entries()].some(([key,value])=>key.endsWith(':lock')&&value==='new-owner'));
});
test('Redis outage and shared budget limits fail closed',async()=>{
  const broken=new RedisConversationStore({url:'https://unit.upstash.io',token:'unit-test-token',fetcher:async()=>{throw new Error('offline');}});await assert.rejects(broken.transaction('key',async()=>{}),error=>error.code==='STORE_UNAVAILABLE');
  const fixture=redisFixture(),store=storeFor(fixture);await store.consumeBudget('site',1);await assert.rejects(store.consumeBudget('site',1),error=>error.code==='RATE_LIMITED');
});
test('Explicit Indonesian navigation and real title/URL references retain behavior',()=>{
  const legacy=JSON.parse(readFileSync(new URL('./fixtures/articles.json',import.meta.url)));const byId=new Map(legacy.map(a=>[a.id,a]));const url='http://localhost/tes_openclaw/#';
  const history=[{role:'assistant',content:JSON.stringify({text:byId.get('nasional-1').title,toolCalls:[],finished:true})}];
  for(const[query,capabilityId]of [['buka kan aku 1 berita terbaru','news.open_article'],['oke buka kan artikel itu','news.open_article'],['tolong bukakan satu berita teknologi terbaru','news.open_article'],['buka halaman teknologi','news.category'],['buka page olahraga','news.category'],['buka halaman gaya hidup','news.category'],['buka artikel nasional-24','news.open_article'],['buka halaman tersimpan','news.saved'],['tampilkan berita terpopuler','news.collection'],['bukakan pilihan editor','news.collection'],['buka lensa kabarin','news.collection'],['buka beranda','news.home'],['buka halaman berita terbaru','news.section'],['buka bagian opini','news.section'],['bawa aku ke bagian terbaru','news.section'],['buka #kategori/dunia','news.category'],['buka http://localhost/tes_openclaw/#artikel/teknologi-1','news.open_article']])assert.equal(navigationIntent(query,legacy,history,url)?.capabilityId,capabilityId,query);
  for(const query of ['jangan buka teknologi','jelaskan cara membuka halaman teknologi','kalau saya bilang buka page nasional','apa isi berita terbaru'])assert.equal(navigationIntent(query,legacy,[],url),null);
  assert.ok(navigationIntent('buka https://attacker.invalid/#kategori/teknologi',legacy,[],url).clarification);
  const a={...catalog[0],title:'Ekonomi dan Teknologi Indonesia'};assert.equal(navigationIntent('Buka '+a.title,[a],[],url).parameters.articleId,a.id);assert.equal(navigationIntent('Buka artikel ini',[a],[],url+'artikel/'+a.id).parameters.articleId,a.id);
});
test('Read truncation, two-way scroll, highlight and negation are preserved',()=>{
  const url=origin+'/#artikel/'+catalog[0].id;
  assert.equal(readingIntent('Gulir artikel ini ke bawah lalu atas',url,null,[]).parameters.position,'end');
  assert.equal(readingIntent('Gulir artikel ini ke bawah lalu atas',url,null,[{capabilityId:'page.scroll_to',status:'success',evidence:{scope:'article',position:'end'}}]).parameters.position,'start');
  assert.equal(readingIntent('Sorot artikel ini',url,null,[]).capabilityId,'page.highlight');
  assert.equal(readingIntent('Jangan rangkum artikel ini',url,null,[]),null);
  const result={capabilityId:'page.read',status:'success',evidence:{scope:'article',url,truncated:true,nextOffset:24000}};
  assert.equal(readingIntent('Rangkum artikel ini',url,null,[result]).parameters.offset,24000);
  const end=readingIntent('Rangkum artikel ini',url,null,[{...result,evidence:{...result.evidence,nextOffset:null}}]);assert.equal(end.summary,true);assert.equal(end.complete,false);
});
test('Node SumoPod provider uses the preset and keeps key out of prompt/body',async()=>{
  let captured;const provider=new OpenAiCompatibleProvider({provider:'sumopod',apiKey:'test-private-token',model:'synthetic-model',fetch:async(url,options)=>{captured={url:String(url),options};return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({text:'OK',emotion:'idle',finished:true,toolCalls:[]})}}]});}});
  const reply=await provider.complete([{role:'system',content:'Public portal prompt'},{role:'user',content:'Hello'}],[],1000);assert.equal(reply.text,'OK');assert.equal(captured.url,'https://ai.sumopod.com/v1/chat/completions');assert.equal(captured.options.headers.Authorization,'Bearer test-private-token');assert.ok(!captured.options.body.includes('test-private-token'));assert.equal(JSON.parse(captured.options.body).response_format.type,'json_object');
});
