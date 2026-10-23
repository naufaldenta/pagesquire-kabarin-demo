import {createHash,randomBytes} from 'node:crypto';
import {AssistantError,readBounded} from './vendor/pagesquire.mjs';
const fail=(code,message,status=503)=>{throw new AssistantError(code,message,status);};
// Every checkpoint is fenced by the lease owner; a timed-out worker cannot overwrite a newer turn.
const LOAD="if redis.call('GET',KEYS[1]) ~= ARGV[1] then return redis.error_reply('STALE_LOCK') end return redis.call('GET',KEYS[2])";
const SAVE="if redis.call('GET',KEYS[1]) ~= ARGV[1] then return redis.error_reply('STALE_LOCK') end redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]) return 'OK'";
const RELEASE="if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
const BUDGET="local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],60) end return n";
export class RedisConversationStore{
  constructor({url,token,prefix='kabarin:assistant:v1',fetcher=fetch}){
    let endpoint;try{endpoint=new URL(url);}catch{fail('INVALID_STORE','Atur REST URL Redis di environment.');}
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/'||!token||/[\r\n]/.test(token))fail('INVALID_STORE','Konfigurasi Redis belum valid.');
    this.url=endpoint.href;this.token=token;this.prefix=prefix;this.fetcher=fetcher;
  }
  async command(args){
    try{
      const signal=AbortSignal.timeout(8000);
      const response=await this.fetcher(this.url,{method:'POST',redirect:'error',signal,headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify(args)});
      if(!response.ok)fail('STORE_UNAVAILABLE','Penyimpanan sesi AI belum tersedia.');
      const result=JSON.parse(await readBounded(response,2200000,signal));
      if(result.error)fail(result.error==='STALE_LOCK'?'BUSY':'STORE_UNAVAILABLE','Sesi sedang digunakan atau penyimpanan belum tersedia.',result.error==='STALE_LOCK'?409:503);
      if(!Object.hasOwn(result,'result'))fail('STORE_UNAVAILABLE','Respons penyimpanan belum valid.');
      return result.result;
    }catch(error){if(error instanceof AssistantError)throw error;fail('STORE_UNAVAILABLE','Penyimpanan sesi AI belum tersedia.');}
  }
  async consumeBudget(key,maximum){
    const value=await this.command(['EVAL',BUDGET,1,`${this.prefix}:budget:${createHash('sha256').update(key).digest('hex')}`]);
    if(!Number.isInteger(value)||value>maximum)fail('RATE_LIMITED','Batas permintaan AI tercapai. Coba sebentar lagi.',429);
  }
  async transaction(key,operation){
    const name=`${this.prefix}:${createHash('sha256').update(key).digest('hex')}`;const lock=name+':lock',owner=randomBytes(32).toString('hex');
    if(await this.command(['SET',lock,owner,'NX','PX',120000])!=='OK')fail('BUSY','Permintaan AI sebelumnya masih berjalan.',409);
    try{return await operation({
      load:async()=>{const value=await this.command(['EVAL',LOAD,2,lock,name,owner]);if(value===null)return null;if(typeof value!=='string'||Buffer.byteLength(value)>2097152)fail('INVALID_STORE','Sesi AI tidak valid.');try{return JSON.parse(value);}catch{fail('INVALID_STORE','Sesi AI tidak valid.');}},
      save:async value=>{const data=JSON.stringify(value);if(Buffer.byteLength(data)>2097152)fail('INVALID_STORE','Batas sesi AI tercapai.');await this.command(['EVAL',SAVE,2,lock,name,owner,data,900]);}
    });}finally{await this.command(['EVAL',RELEASE,1,lock,owner]).catch(()=>{});}
  }
}
