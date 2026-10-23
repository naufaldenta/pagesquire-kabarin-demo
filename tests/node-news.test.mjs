import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {parseFeed,safeUrl,NewsService,newsResponse,sources,seed} from '../server/news.mjs';
const feed=sources[7];const date='Fri, 23 Oct 2026 08:00:00 +0700';
const rss=(slug='one')=>`<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><item><title>Judul &amp; berita ${slug}</title><link>https://www.antaranews.com/berita/101/${slug}</link><pubDate>${date}</pubDate><description><![CDATA[<p>Cuplikan sumber. <script>not_prose()</script></p>]]></description><media:content url="https://img.antaranews.com/cache/800x533/test.jpg"/><dc:creator>Penulis sumber</dc:creator></item></channel></rss>`;
test('RSS parser keeps actual text/media/byline and PHP-compatible stable identity',()=>{
  const a=parseFeed(rss(),feed)[0];assert.equal(a.summary,'Cuplikan sumber.');assert.equal(a.content,a.summary);assert.equal(a.coverage,'excerpt');assert.equal(a.author,'Penulis sumber');assert.equal(a.photos.length,1);assert.equal(a.imageUrl,'https://img.antaranews.com/cache/800x533/test.jpg');assert.equal(a.id,'news-'+createHash('sha256').update(a.sourceUrl).digest('hex').slice(0,16));
});
test('Untrusted XML, executable/foreign URLs and oversized feeds fail closed',()=>{
  for(const body of ['<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>','<rss><bad>','x'.repeat(2000001)])assert.throws(()=>parseFeed(body,feed));
  for(const url of ['javascript:alert(1)','https://attacker.invalid/foo','https://www.antaranews.com@127.0.0.1/foo'])assert.equal(safeUrl(url),'');
});
test('No creator becomes publisher attribution, never a fictional person',()=>{const a=parseFeed(rss().replace('<dc:creator>Penulis sumber</dc:creator>',''),feed)[0];assert.equal(a.authorProvided,false);assert.equal(a.author,feed.publisher);});
test('Fresh cache, cross-instance archive and feed outages retain real snapshots',async()=>{
  let now=Date.parse('2026-10-23T12:00:00Z'),calls=0,slug='one';const memory=new Map();
  const cache={get:async key=>structuredClone(memory.get(key)??null),set:async(key,value)=>memory.set(key,structuredClone(value))};
  const fetcher=async url=>{assert.ok(sources.some(f=>f.url===url));calls++;return new Response(rss(slug));};
  const initial={schemaVersion:1,articles:[],meta:{checkedAt:0,feeds:[]}};
  const service=new NewsService({cache,fetcher,initial,now:()=>now});const first=await service.snapshot();assert.equal(first.articles.length,1);assert.equal(calls,18);const id=first.articles[0].id;
  await service.snapshot();assert.equal(calls,18);const cold=new NewsService({cache,fetcher,initial,now:()=>now});assert.equal((await cold.snapshot()).articles[0].id,id);assert.equal(calls,18);
  now+=601000;slug='two';const second=await cold.snapshot();assert.notEqual(second.articles[0].id,id);
  const archived=new NewsService({cache,fetcher,initial,now:()=>now});assert.equal((await archived.find([id]))[0].id,id);
  const beforeCatalog=calls;assert.ok((await archived.catalog()).some(a=>a.id===second.articles[0].id));assert.equal(calls,beforeCatalog,'Chat catalog reads the shared snapshot without another RSS refresh');
  now+=601000;archived.fetcher=async()=>{throw new Error('offline');};const stale=await archived.snapshot();assert.equal(stale.meta.stale,true);assert.equal(stale.articles[0].id,second.articles[0].id);
});
test('Cold start without runtime cache/network uses an honest real fallback',async()=>{
  const service=new NewsService({initial:{...seed,meta:{...seed.meta,checkedAt:0}},fetcher:async()=>{throw new Error('offline');}});const data=await service.snapshot();assert.equal(data.articles.length,seed.articles.length);assert.equal(data.meta.stale,true);assert.ok(data.articles.every(a=>a.coverage==='excerpt'));assert.deepEqual(await service.find(['news-0000000000000000']),[]);
});
test('JSON endpoint validates IDs/methods and sets CDN cache without exposing filesystem',async()=>{
  const service=new NewsService({initial:{...seed,meta:{...seed.meta,checkedAt:Math.floor(Date.now()/1000)}}});
  let result=await newsResponse(new Request('https://portal.example/api/news'),service);assert.equal(result.status,200);assert.match(result.headers.get('vercel-cdn-cache-control'),/s-maxage=600/);
  for(const query of ['?ids=javascript:bad','?ids[]=bad','?ids=a&ids=b']){result=await newsResponse(new Request('https://portal.example/api/news'+query),service);assert.equal(result.status,422);}
  assert.equal((await newsResponse(new Request('https://portal.example/api/news',{method:'POST'}),service)).status,405);
  const id=seed.articles[0].id;result=await newsResponse(new Request('https://portal.example/api/news?ids='+id),service);assert.equal((await result.json()).articles[0].id,id);
});
test('Saved article survives loss of the server archive and an offline reload',async()=>{
  const script=await readFile(new URL('../data.js',import.meta.url),'utf8');const memory=new Map();
  const localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  const scope={window:{},URL,AbortSignal,localStorage,location:{hash:''},fetch:async()=>({ok:true,json:async()=>seed})};vm.runInNewContext(script,scope);const data=await scope.window.KABARIN_READY;const id=data.articles[0].id;data.persistSaved([id]);
  const reloaded={...scope,window:{},location:{hash:'#tersimpan'},fetch:async()=>{throw new Error('offline');}};vm.runInNewContext(script,reloaded);const offline=await reloaded.window.KABARIN_READY;assert.equal(offline.get(id).sourceUrl,data.get(id).sourceUrl);assert.equal(offline.mixed.length,0);assert.equal(offline.unavailable,true);
});
test('Opening index.html as a file renders actual bundled news even when fetch is unavailable',async()=>{
  let requests=0;const scope={window:{},URL,AbortSignal,localStorage:{getItem:()=>null},location:{hash:'',protocol:'file:'},fetch:async()=>{requests++;throw new TypeError('File URLs cannot execute an API');}};
  vm.runInNewContext(await readFile(new URL('../assets/news-snapshot.js',import.meta.url),'utf8'),scope);
  vm.runInNewContext(await readFile(new URL('../data.js',import.meta.url),'utf8'),scope);
  const data=await scope.window.KABARIN_READY;assert.equal(data.mixed.length,seed.articles.length);assert.equal(data.unavailable,false);assert.equal(data.meta.stale,true);assert.equal(data.meta.origin,'bundled-snapshot');
  await scope.window.KABARIN_REFRESH;assert.equal(scope.window.KABARIN,data);assert.equal(data.mixed.length,seed.articles.length);assert.equal(await data.ensure('news-0000000000000000'),null);assert.equal(requests,0,'Static file mode never requests a server API');
  assert.ok(!JSON.stringify(scope.window.KABARIN_NEWS_SNAPSHOT).includes('PAGESQUIRE_'));assert.ok(data.articles.every(a=>a.coverage==='excerpt'));
});
test('A pending API never blocks bundled news and fresh data updates the existing model', {timeout:2000},async()=>{
  const memory=new Map();let complete;const events=[];
  const scope={window:{dispatchEvent:event=>events.push(event.type)},CustomEvent:class{constructor(type){this.type=type;}},URL,AbortSignal,localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)},location:{hash:''},fetch:()=>new Promise(resolve=>{complete=resolve;})};
  vm.runInNewContext(await readFile(new URL('../assets/news-snapshot.js',import.meta.url),'utf8'),scope);
  vm.runInNewContext(await readFile(new URL('../data.js',import.meta.url),'utf8'),scope);
  const model=await scope.window.KABARIN_READY;assert.equal(model.mixed.length,seed.articles.length);const id=model.mixed[0].id;model.recordView(id);
  const current={...seed,meta:{...seed.meta,stale:false},articles:seed.articles.map(a=>a.id===id?{...a,title:'Updated headline from the API test transport'}:a)};
  complete({ok:true,json:async()=>current});await scope.window.KABARIN_REFRESH;
  assert.equal(scope.window.KABARIN,model);assert.equal(model.meta.stale,false);assert.equal(model.get(id).title,'Updated headline from the API test transport');assert.equal(model.get(id).views,1);assert.deepEqual(events,['kabarin:news-updated']);
});
test('Invalid API content cannot erase an already rendered real snapshot',async()=>{
  const scope={window:{},URL,AbortSignal,localStorage:{getItem:()=>null},location:{hash:''},fetch:async()=>({ok:true,json:async()=>({articles:[{id:'invalid'}],meta:{}})})};
  vm.runInNewContext(await readFile(new URL('../assets/news-snapshot.js',import.meta.url),'utf8'),scope);
  vm.runInNewContext(await readFile(new URL('../data.js',import.meta.url),'utf8'),scope);
  const model=await scope.window.KABARIN_READY;await scope.window.KABARIN_REFRESH;assert.equal(model.mixed.length,seed.articles.length);assert.equal(model.meta.origin,'bundled-snapshot');
});
