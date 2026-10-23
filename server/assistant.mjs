import {createHash,createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {AssistantError,ConversationEngine,createChatHandler,OpenAiCompatibleProvider,providerConfigurationFromEnv,forgetConversation,readBounded} from './vendor/pagesquire.mjs';
import {createConversationStore} from './conversation-store.mjs';
import {PortalProvider} from './portal-provider.mjs';
import {news} from './news.mjs';
import {createDemoQuota,demoEnabled,networkIdentity} from './demo-quota.mjs';
const manifest=JSON.parse(readFileSync(new URL('../integration/capabilities.json',import.meta.url),'utf8'));
const COOKIE='KABARIN_NODE_SESSION';
const fail=(code,message,status=403)=>{throw new AssistantError(code,message,status);};
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length>4096)return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};
const json=(body,status=200,extra={})=>Response.json(body,{status,headers:{'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',...extra}});
function publicOrigin(env){
  const domain=env.VERCEL_ENV==='production'?env.VERCEL_PROJECT_PRODUCTION_URL||env.VERCEL_URL:env.VERCEL_URL;
  const value=env.PAGESQUIRE_ORIGIN||(domain?`https://${domain}`:'http://localhost');let origin;
  try{origin=new URL(value);}catch{fail('INVALID_HOST_CONFIG','Atur origin publik di environment.',503);}
  if(!['https:','http:'].includes(origin.protocol)||origin.origin!==value)fail('INVALID_HOST_CONFIG','Origin harus tanpa path atau trailing slash.',503);
  return value;
}
const bounded=(value,fallback,min,max)=>Math.max(min,Math.min(max,Number.parseInt(value,10)||fallback));
/** Stateless signed session identity + shared, durable conversation checkpoints. */
export function createAssistantHost({env=process.env,store:injectedStore,provider:injectedProvider,service=news}={}){
  let sharedStore=injectedStore;
  const secret=env.PAGESQUIRE_SESSION_SECRET||env.PAGESQUIRE_API_KEY||env.PAGESQUIRE_PROVIDER_KEY;
  const mac=value=>createHmac('sha256',createHash('sha256').update(`kabarin-session-v1:${secret}`).digest()).update(value).digest('base64url');
  function readSession(request,origin){
    if(!secret)return null;
    const values=(request.headers.get('cookie')??'').split(';').map(part=>part.trim()).filter(part=>part.startsWith(COOKIE+'='));if(values.length!==1)return null;
    const value=values[0].slice(COOKIE.length+1);if(value.length>512)return null;
    const[payload,signature,...rest]=value.split('.');if(!payload||!signature||rest.length||!equal(mac('cookie:'+payload),signature))return null;
    let data;try{data=JSON.parse(Buffer.from(payload,'base64url').toString());}catch{return null;}
    if(!/^[a-f0-9]{64}$/.test(data.id??'')||!Number.isSafeInteger(data.exp)||data.exp<=Date.now()/1000||data.exp>Date.now()/1000+901)return null;
    return {key:createHash('sha256').update(origin+':'+data.id).digest('hex'),principal:'public-reader-v2',csrfToken:mac('csrf:'+data.id),capabilityIds:manifest.capabilities.map(c=>c.id)};
  }
  function configuration(origin){
    try{
      const providerConfig=providerConfigurationFromEnv(env);
      if(env.PAGESQUIRE_ALLOW_REMOTE!=='true'&&!['localhost','127.0.0.1','[::1]'].includes(new URL(origin).hostname))return {ready:false,reason:'REMOTE_DISABLED'};
      if(env.PAGESQUIRE_SESSION_SECRET&&env.PAGESQUIRE_SESSION_SECRET.length<32)return {ready:false,reason:'SESSION_SECRET_TOO_SHORT'};
      if(demoEnabled(env)&&(!env.PAGESQUIRE_SESSION_SECRET||env.PAGESQUIRE_SESSION_SECRET.length<32))return {ready:false,reason:'SESSION_SECRET_REQUIRED'};
      const store=sharedStore||=createConversationStore(env);
      return {ready:true,store,provider:injectedProvider||new OpenAiCompatibleProvider({...providerConfig,timeoutMs:bounded(env.PAGESQUIRE_TIMEOUT_SECONDS,30,5,45)*1000})};
    }catch{return {ready:false,reason:'PROVIDER_OR_SESSION_STORE_NOT_CONFIGURED'};}
  }
  return async function assistantResponse(request,action){
    try{
      const origin=publicOrigin(env),headerOrigin=request.headers.get('origin');
      if((headerOrigin&&headerOrigin!==origin)||request.headers.get('sec-fetch-site')==='cross-site')fail('ORIGIN_DENIED','Asal permintaan tidak diizinkan.');
      if(!['session','chat','reset'].includes(action))return json({error:'NOT_FOUND'},404);
      if(request.method!==(action==='session'?'GET':'POST'))return json({error:{code:'METHOD_NOT_ALLOWED',message:`Gunakan ${action==='session'?'GET':'POST'}.`}},405,{Allow:action==='session'?'GET':'POST'});
      const config=configuration(origin);let session=readSession(request,origin);
      const quota=config.ready?createDemoQuota(request,env,config.store):null;
      if(action==='session'){
        const dailyQuota=quota?await quota.status():null;
        const headers={};
        if(config.ready&&!session){
          const data={id:randomBytes(32).toString('hex'),exp:Math.floor(Date.now()/1000)+900};const payload=Buffer.from(JSON.stringify(data)).toString('base64url');const value=payload+'.'+mac('cookie:'+payload);
          headers['Set-Cookie']=`${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=900${origin.startsWith('https:')?'; Secure':''}`;
          session=readSession(new Request(request.url,{headers:{cookie:`${COOKIE}=${value}`}}),origin);
        }
        return json({configured:config.ready,provider:'SumoPod',csrfToken:session?.csrfToken??randomBytes(32).toString('hex'),endpoint:'/api/assistant-chat',resetEndpoint:'/api/assistant-reset',...(dailyQuota?{dailyQuota}:{}),...(config.reason?{reason:config.reason}:{})},200,headers);
      }
      if(headerOrigin!==origin)fail('ORIGIN_DENIED','Asal permintaan tidak diizinkan.');
      if(!config.ready)fail('PROVIDER_NOT_CONFIGURED','Atur SumoPod dan penyimpanan sesi di Environment Variables untuk mengaktifkan chat.',503);
      if(!session)fail('ACCESS_DENIED','Muat ulang halaman untuk memperbarui sesi.');
      if(!equal(request.headers.get('x-csrf-token'),session.csrfToken))fail('CSRF_MISMATCH','Muat ulang halaman untuk memperbarui sesi.',419);
      if(config.store.consumeBudget){
        await config.store.consumeBudget('site:'+origin,bounded(env.PAGESQUIRE_SITE_REQUESTS_PER_MINUTE,120,20,1000));
        if(quota){const identity=createHmac('sha256',env.PAGESQUIRE_QUOTA_SECRET).update(networkIdentity(request,env)).digest('hex');await config.store.consumeBudget('network:'+identity,40);}
      }
      if(action==='reset'){
        if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))fail('JSON_REQUIRED','Gunakan JSON.',415);
        let body;try{body=JSON.parse(await readBounded(request,1024));}catch{fail('INVALID_PAYLOAD','Permintaan tidak valid.',422);}
        if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).length)fail('INVALID_PAYLOAD','Permintaan tidak valid.',422);
        await forgetConversation(config.store,session.key,session.principal);return json({ok:true});
      }
      let quotaRejected=false;
      const meteredProvider={complete:async(...args)=>{try{await quota?.inference();}catch(error){if(error instanceof AssistantError&&error.code==='DEMO_DAILY_LIMIT')quotaRejected=true;throw error;}args[3]?.throwIfAborted();return config.provider.complete(...args);}};
      const provider=new PortalProvider(meteredProvider,()=>service.catalog());
      const engine=new ConversationEngine({provider,manifest,maxSteps:8,maxAttempts:12,maxOutputTokens:bounded(env.PAGESQUIRE_MAX_OUTPUT_TOKENS,1600,256,4096)});
      const guardedEngine={handle:async(raw,state,allowed,checkpoint,signal)=>{
        let charged=false;
        return engine.handle(raw,state,allowed,async next=>{
          if(quota&&raw.message!==undefined&&!charged){await quota.message();signal?.throwIfAborted();charged=true;}
          await checkpoint(next);
        },signal);
      }};
      const handler=createChatHandler({engine:guardedEngine,store:config.store,origin,authorize:async()=>session,requestsPerMinute:20,timeoutMs:55000});
      let response=await handler(request);
      if(quotaRejected)response=json({error:{code:'DEMO_DAILY_LIMIT',message:'Batas panggilan AI demo hari ini tercapai. Coba besok pukul 07.00 WIB.'}},429);
      if(quota){const status=await quota.status();response.headers.set('X-Demo-Remaining',String(status.remaining));response.headers.set('X-Demo-Resets-At',status.resetsAt);if(response.status===429&&(await response.clone().json()).error?.code==='DEMO_DAILY_LIMIT')response.headers.set('Retry-After',String(Math.max(1,Math.ceil((Date.parse(status.resetsAt)-Date.now())/1000))));}
      return response;
    }catch(error){const known=error instanceof AssistantError;return json({error:{code:known?error.code:'ASSISTANT_UNAVAILABLE',message:known?error.message:'Asisten sementara belum tersedia.'}},known?error.status:503,error?.status===429?{'Retry-After':'60'}:{});}
  };
}
export const assistantResponse=createAssistantHost();
