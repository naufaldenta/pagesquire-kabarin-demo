import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';
import {AssistantError} from './vendor/pagesquire.mjs';

const fail=(code,message,status=503)=>{throw new AssistantError(code,message,status);};
export const demoEnabled=env=>env.VERCEL==='1'||env.PAGESQUIRE_PUBLIC_DEMO==='true';
/** Only Vercel's overwritten edge header is trusted. Never fingerprint private mode. */
export function networkIdentity(request,env){
  if(env.VERCEL!=='1')fail('DEMO_IDENTITY_UNAVAILABLE','Identitas jaringan tepercaya belum tersedia.');
  const value=request.headers.get('x-vercel-forwarded-for');
  if(!value||value.length>64||value!==value.trim()||!isIP(value))fail('DEMO_IDENTITY_UNAVAILABLE','Identitas jaringan tepercaya belum tersedia.');
  if(isIP(value)===4)return value;
  const canonical=new URL(`http://[${value}]/`).hostname.slice(1,-1);
  const [left,right]=canonical.split('::'),a=left?left.split(':'):[],b=right?right.split(':'):[];
  const parts=canonical.includes('::')?[...a,...Array(8-a.length-b.length).fill('0'),...b]:a;
  const numbers=parts.map(part=>parseInt(part,16));
  if(numbers.slice(0,5).every(n=>n===0)&&numbers[5]===65535)return [numbers[6]>>8,numbers[6]&255,numbers[7]>>8,numbers[7]&255].join('.');
  return numbers.slice(0,4).map(n=>n.toString(16)).join(':')+'::/64';
}
export function createDemoQuota(request,env,store){
  if(!demoEnabled(env))return null;
  const secret=env.PAGESQUIRE_QUOTA_SECRET;
  if(typeof secret!=='string'||secret.length<32||typeof store.consumeDailyBudget!=='function'||typeof store.dailyBudget!=='function')fail('DEMO_NOT_CONFIGURED','Pengaman kuota demo belum tersedia.');
  const network=networkIdentity(request,env);
  const identity=createHmac('sha256',secret).update('kabarin-demo-network-v1:'+network).digest('hex');
  const key=kind=>`public-demo-v1:${kind}:${identity}`;
  return {
    status:()=>store.dailyBudget(key('messages'),5),
    message:async()=>{
      await store.consumeDailyBudget(key('messages'),5);
      await store.consumeDailyBudget('public-demo-v1:site-messages',50);
    },
    inference:async()=>{
      await store.consumeDailyBudget(key('inference'),25);
      await store.consumeDailyBudget('public-demo-v1:site-inference',100);
    },
  };
}
