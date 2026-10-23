import {createPreview} from '../scripts/dev-server.mjs';
import {createAssistantHost} from '../server/assistant.mjs';
import {RedisConversationStore} from '../server/redis-store.mjs';
import {redisFixture} from './support/redis-fixture.mjs';
const fixture=redisFixture();
const host=createAssistantHost({env:{PAGESQUIRE_PROVIDER:'sumopod',PAGESQUIRE_API_KEY:'qa-key-only',PAGESQUIRE_MODEL:'synthetic-model',PAGESQUIRE_ORIGIN:'http://127.0.0.1:4188',PAGESQUIRE_ALLOW_REMOTE:'true'},store:new RedisConversationStore({url:'https://unit.upstash.io',token:'unit-test-token',fetcher:fixture.fetcher}),provider:{complete:async()=>({text:'Respons model disimulasikan untuk pengujian Node. Berita dan cuplikan mengikuti feed sumber yang dibaca.',emotion:'happy',finished:true,toolCalls:[]})}});
const assistant=async(request,action)=>{const response=await host(request,action);if(action!=='session')return response;const data=await response.json();data.provider='PROVIDER TIRUAN / NODE QA';return Response.json(data,{status:response.status,headers:response.headers});};
createPreview({assistant,banner:'UJI NODE VERCEL — PROVIDER DAN REDIS TIRUAN, TANPA PANGGILAN BERBAYAR'}).listen(4188,'127.0.0.1',()=>console.log('Node QA: http://127.0.0.1:4188/ (actual RSS, synthetic AI/Redis)'));
