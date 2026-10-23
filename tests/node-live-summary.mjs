// Explicit opt-in, one provider completion. Public DOM evidence only; no user chat state.
import {readFile,writeFile} from 'node:fs/promises';
import {ConversationEngine,OpenAiCompatibleProvider,providerConfigurationFromEnv} from '../server/vendor/pagesquire.mjs';
import {PortalProvider} from '../server/portal-provider.mjs';
import {seed} from '../server/news.mjs';
if(!process.argv.includes('--live')){console.error('Opt-in required: node --env-file=.env tests/node-live-summary.mjs --live');process.exit(2);}
try{
  const input=JSON.parse(await readFile(new URL('../.build/live-summary-input.json',import.meta.url),'utf8'));
  if(typeof input.text!=='string'||input.text.length<200||input.text.length>24000||!/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/.*#artikel\/news-[a-f0-9]{16}$/.test(input.url))throw new Error('Invalid public DOM input');
  const manifest=JSON.parse(await readFile(new URL('../integration/capabilities.json',import.meta.url),'utf8'));const ids=manifest.capabilities.map(c=>c.id);
  const config=providerConfigurationFromEnv(process.env);const provider=new PortalProvider(new OpenAiCompatibleProvider({...config,timeoutMs:30000}),async()=>seed.articles);
  const engine=new ConversationEngine({provider,manifest,maxOutputTokens:800});
  const snapshot={protocolVersion:'0.1',id:'node-live-article',url:input.url,title:input.title,text:'Artikel publik sudah terbuka.',targets:[],truncated:{text:false,targets:false}};
  const first=await engine.handle({protocolVersion:'0.1',requestId:'node-live-start',message:'Telusuri artikel ini lalu rangkum isinya',snapshot,capabilityIds:ids},null,ids);
  const call=first.reply.response.toolCalls[0];if(call?.capabilityId!=='page.read')throw new Error('Reading must precede summary');
  const final=await engine.handle({protocolVersion:'0.1',requestId:'node-live-finish',conversationId:first.reply.conversationId,snapshot,capabilityIds:ids,result:{protocolVersion:'0.1',callId:call.callId,capabilityId:'page.read',status:'success',code:'VERIFIED',message:'Public QA DOM text',evidence:{scope:'article',url:input.url,text:input.text,complete:true,truncated:false,nextOffset:null}}},first.state,ids);
  const response=final.reply.response;if(!response.finished||response.toolCalls.length||!response.text.includes('Cakupan:'))throw new Error('Final summary failed');
  await writeFile(new URL('../.build/node-live-summary-result.json',import.meta.url),JSON.stringify({provider:'SumoPod',text:response.text,finished:true},null,2));
  console.log('PASS: one real SumoPod completion through Node after actual public article reading.\n'+response.text);
}catch(error){console.error('Node live summary did not pass: '+(typeof error.code==='string'?error.code:'CHECK_FAILED'));process.exitCode=1;}
