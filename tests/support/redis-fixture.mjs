import assert from 'node:assert/strict';
/** Test-only REST transport. No real account, token, DB, provider or network is used. */
export function redisFixture(){
  const values=new Map(),expires=new Map(),commands=[];let now=Date.now();
  const get=key=>{if((expires.get(key)??Infinity)<=now){values.delete(key);expires.delete(key);}return values.get(key)??null;};
  const set=(key,value,ttl)=>{values.set(key,value);if(ttl)expires.set(key,now+ttl);return 'OK';};
  return {values,commands,get,advance:ms=>{now+=ms;},fetcher:async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer unit-test-token');assert.equal(options.redirect,'error');const command=JSON.parse(options.body);commands.push(command);let result;
    const[name,...args]=command;
    if(name==='SET'){const[key,value,...flags]=args;result=flags.includes('NX')&&get(key)!==null?null:set(key,value,flags.includes('PX')?Number(flags[flags.indexOf('PX')+1]):null);}
    else if(name==='EVAL'){
      const[script,n,...rest]=args;const keys=rest.slice(0,n),argv=rest.slice(n);
      if(script.includes("redis.call('INCR'")){result=Number(get(keys[0])??0)+1;set(keys[0],String(result),60000);}
      else if(script.includes('STALE_LOCK')&&get(keys[0])!==argv[0])return Response.json({error:'STALE_LOCK'});
      else if(script.includes("redis.call('SET'"))result=set(keys[1],argv[1],Number(argv[2])*1000);
      else if(script.includes("redis.call('DEL'")){result=get(keys[0])===argv[0]?Number(values.delete(keys[0])):0;}
      else result=get(keys[1]);
    }else throw new Error('Unexpected Redis command '+name);
    return Response.json({result});
  }};
}
