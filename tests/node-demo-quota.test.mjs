import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createAssistantHost} from '../server/assistant.mjs';
import {networkIdentity,createDemoQuota} from '../server/demo-quota.mjs';
import {AssistantError} from '../server/vendor/pagesquire.mjs';
import {RedisConversationStore} from '../server/redis-store.mjs';
import {redisFixture} from './support/redis-fixture.mjs';
import {seed} from '../server/news.mjs';
const origin='https://demo.example';
const env={VERCEL:'1',PAGESQUIRE_PROVIDER:'sumopod',PAGESQUIRE_API_KEY:'synthetic-key',PAGESQUIRE_MODEL:'synthetic-model',PAGESQUIRE_SESSION_SECRET:'s'.repeat(64),PAGESQUIRE_QUOTA_SECRET:'q'.repeat(64),PAGESQUIRE_ORIGIN:origin,PAGESQUIRE_ALLOW_REMOTE:'true'};
const ids=JSON.parse(readFileSync(new URL('../integration/capabilities.json',import.meta.url))).capabilities.map(c=>c.id);
const snapshot=()=>({protocolVersion:'0.1',id:randomUUID(),url:origin+'/#',title:'Kabarin',text:'Public content',targets:[],truncated:{text:false,targets:false}});
function harness({broken=false,providerFailure=false}={}){
  const fixture=redisFixture(),budgets=new Map();let calls=0;
  const store=new RedisConversationStore({url:'https://unit.upstash.io',token:'unit-test-token',fetcher:fixture.fetcher});
  store.dailyBudget=async(key,maximum)=>({limit:maximum,remaining:Math.max(0,maximum-(budgets.get(key)||0)),resetsAt:'2099-01-01T00:00:00.000Z',timezone:'UTC'});
  store.consumeDailyBudget=async(key,maximum)=>{if(broken)throw new Error('private database secret');if((budgets.get(key)||0)>=maximum)throw new AssistantError('DEMO_DAILY_LIMIT','Daily limit',429);budgets.set(key,(budgets.get(key)||0)+1);};
  const host=()=>createAssistantHost({env,store,provider:{complete:async()=>{calls++;if(providerFailure)throw new Error('provider private secret');return {text:'Synthetic answer',emotion:'happy',finished:true,toolCalls:[]};}},service:{catalog:async()=>seed.articles}});
  const request=(h,action,body,headers={})=>h(new Request(origin+'/api/assistant-'+action,{method:action==='session'?'GET':'POST',headers:{origin,'content-type':'application/json','x-vercel-forwarded-for':'203.0.113.7',...headers},...(action==='session'?{}:{body:JSON.stringify(body)})}),action);
  const session=async()=>{const r=await request(host(),'session');assert.equal(r.status,200);const data=await r.json();assert.equal(data.dailyQuota.limit,5);return {cookie:r.headers.get('set-cookie').split(';')[0],'x-csrf-token':data.csrfToken};};
  const message=()=>({protocolVersion:'0.1',requestId:randomUUID(),message:'Hello there',snapshot:snapshot(),capabilityIds:ids});
  return {host,request,session,message,budgets,store,get calls(){return calls;}};
}
test('Public demo permits five messages across new cookies/instances; reset and private mode cannot restore network quota',async()=>{
  const h=harness();for(let i=0;i<5;i++){const s=await h.session();assert.equal((await h.request(h.host(),'chat',h.message(),s)).status,200);assert.equal((await h.request(h.host(),'reset',{},s)).status,200);}
  const s=await h.session();const denied=await h.request(h.host(),'chat',h.message(),{...s,'x-forwarded-for':'198.51.100.55'});assert.equal(denied.status,429);assert.equal(denied.headers.get('x-demo-remaining'),'0');assert.ok(Number(denied.headers.get('retry-after'))>60);assert.equal(h.calls,5);
  assert.equal((await h.request(h.host(),'chat',h.message(),{...s,'x-vercel-forwarded-for':'203.0.113.8'})).status,200);
});
test('Exact cached retry charges neither another message nor inference; a conflicting replay stays denied',async()=>{
  const h=harness(),s=await h.session(),body=h.message();const first=await(await h.request(h.host(),'chat',body,s)).json();
  assert.deepEqual(await(await h.request(h.host(),'chat',body,s)).json(),first);assert.equal(h.calls,1);
  assert.equal((await h.request(h.host(),'chat',{...body,message:'Changed'},s)).status,409);
  const status=await(await h.request(h.host(),'session')).json();assert.equal(status.dailyQuota.remaining,4);
});
test('Compound navigation and browser-result continuation consume one user message, not each action round',async()=>{
  const h=harness(),s=await h.session();const first=await(await h.request(h.host(),'chat',{...h.message(),message:'buka satu berita teknologi terbaru'},s)).json();const tool=first.response.toolCalls[0];assert.ok(tool);
  const result={protocolVersion:'0.1',callId:tool.callId,capabilityId:tool.capabilityId,status:'success',code:'VERIFIED',message:'Verified',evidence:{route:'article'}};
  const next=await h.request(h.host(),'chat',{protocolVersion:'0.1',requestId:randomUUID(),conversationId:first.conversationId,snapshot:snapshot(),capabilityIds:ids,result},s);assert.equal(next.status,200);
  assert.equal((await(await h.request(h.host(),'session')).json()).dailyQuota.remaining,4);
});
test('Invalid JSON/schema, CSRF and mismatched browser results never consume the daily message allowance',async()=>{
  const h=harness(),s=await h.session();assert.equal((await h.request(h.host(),'chat',{},s)).status,422);
  assert.equal((await h.request(h.host(),'chat',h.message(),{...s,'x-csrf-token':'bad'})).status,419);
  const body=h.message();delete body.message;body.result={protocolVersion:'0.1',callId:'missing',capabilityId:ids[0],status:'success',code:'VERIFIED',message:'No actual action',evidence:{}};
  assert.notEqual((await h.request(h.host(),'chat',body,s)).status,200);assert.equal(h.calls,0);assert.equal((await(await h.request(h.host(),'session')).json()).dailyQuota.remaining,5);
});
test('Provider failures are charged once; missing quota storage fails closed without inference or secret leakage',async()=>{
  for(const options of[{providerFailure:true},{broken:true}]){const h=harness(options),s=await h.session();const r=await h.request(h.host(),'chat',h.message(),s);assert.notEqual(r.status,200);assert.ok(!(await r.text()).includes('private'));assert.equal(h.calls,options.providerFailure?1:0);}
});
test('Global and per-network provider budgets stop billable dispatch without retry',async()=>{
  for(const kind of['site-messages','site-inference','network-inference']){const h=harness(),s=await h.session();if(kind==='site-messages')h.budgets.set('public-demo-v1:site-messages',50);else if(kind==='site-inference')h.budgets.set('public-demo-v1:site-inference',100);else{const q=createDemoQuota(new Request(origin,{headers:{'x-vercel-forwarded-for':'203.0.113.7'}}),env,h.store);for(let i=0;i<25;i++)await q.inference();}
    assert.equal((await h.request(h.host(),'chat',h.message(),s)).status,429);assert.equal(h.calls,0);
  }
});
test('Network identity rejects absent/forged non-Vercel data, normalizes IPv4-mapped IPv6 and groups IPv6 privacy addresses',()=>{
  const req=value=>new Request(origin,{headers:value?{'x-vercel-forwarded-for':value}: {'x-forwarded-for':'203.0.113.1'}});
  assert.equal(networkIdentity(req('::ffff:203.0.113.7'),env),networkIdentity(req('203.0.113.7'),env));
  assert.equal(networkIdentity(req('2001:db8:abcd:1::1'),env),networkIdentity(req('2001:0db8:abcd:0001::fefe'),env));
  for(const value of[null,'garbage','203.0.113.7, 203.0.113.8','fe80::1%eth0'])assert.throws(()=>networkIdentity(req(value),env));
  assert.throws(()=>networkIdentity(req('203.0.113.7'),{}));
  const keys=[],store={dailyBudget:async key=>{keys.push(key);},consumeDailyBudget:async key=>{keys.push(key);}};
  const quota=createDemoQuota(req('203.0.113.7'),env,store);void quota.status();assert.ok(keys.every(k=>!k.includes('203.0.113.7')));
  assert.throws(()=>createDemoQuota(req('203.0.113.7'),{...env,PAGESQUIRE_QUOTA_SECRET:''},store));
});
