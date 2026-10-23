import {AssistantError} from './vendor/pagesquire.mjs';
import {PostgresConversationStore} from './postgres-store.mjs';
import {RedisConversationStore} from './redis-store.mjs';

export function createConversationStore(env){
  const kind=env.PAGESQUIRE_STORE||(env.DATABASE_URL?'postgres':'redis');
  if(kind==='postgres')return new PostgresConversationStore({url:env.DATABASE_URL,namespace:`${env.PAGESQUIRE_APP_ID||'kabarin'}:${env.VERCEL_ENV||'local'}:v1`});
  if(kind==='redis')return new RedisConversationStore({url:env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL,token:env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN,prefix:env.PAGESQUIRE_REDIS_PREFIX||`kabarin:${env.VERCEL_ENV||'local'}:v1`});
  throw new AssistantError('INVALID_STORE','PAGESQUIRE_STORE harus postgres atau redis.',503);
}
