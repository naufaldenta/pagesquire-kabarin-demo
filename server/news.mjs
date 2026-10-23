import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { getCache } from '@vercel/functions';

export const sources = JSON.parse(readFileSync(new URL('../integration/news/sources.json',import.meta.url),'utf8')).feeds;
export const seed = JSON.parse(readFileSync(new URL('../integration/news/seed.json',import.meta.url),'utf8'));
const articleHosts=new Set(['www.antaranews.com','antaranews.com','otomotif.antaranews.com','www.cnnindonesia.com','cnnindonesia.com','www.cnbcindonesia.com','cnbcindonesia.com']);
const imageHosts=new Set(['img.antaranews.com','akcdn.detik.net.id','awsimages.detik.net.id','cdn.cnnindonesia.com','cdn.cnbcindonesia.com']);
export const validId=id=>typeof id==='string'&&/^news-[a-f0-9]{16}$/.test(id);
export function safeUrl(value,image=false){
  try{const url=new URL(String(value??'').trim());return url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&(image?imageHosts:articleHosts).has(url.hostname)?url.href:'';}catch{return '';}
}
export function text(value,limit=6000){
  const raw=typeof value==='object'?value?.['#text']??'':String(value??'');
  return raw.replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<[^>]+>/g,'').replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[\da-f]+);/gi,entity=>{
    const named={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};if(named[entity])return named[entity];const n=entity.startsWith('&#x')?parseInt(entity.slice(3),16):parseInt(entity.slice(2),10);return Number.isSafeInteger(n)&&n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
  }).replace(/\s+/g,' ').trim().slice(0,limit);
}
export function parseFeed(body,feed,now=Date.now()){
  if(Buffer.byteLength(body)>2_000_000||/<!DOCTYPE|<!ENTITY/i.test(body)||XMLValidator.validate(body)!==true)throw new Error('Invalid RSS');
  const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',parseTagValue:false,trimValues:true,htmlEntities:true,processEntities:true,isArray:name=>name==='item'});
  const items=parser.parse(body)?.rss?.channel?.item;if(!Array.isArray(items))throw new Error('Invalid RSS');
  const output=[];
  for(const item of items){
    let sourceUrl=safeUrl(item.link);const title=text(item.title,500);const published=Date.parse(item.pubDate);
    if(!sourceUrl||!title||!Number.isFinite(published)||published>now+86400000)continue;
    const canonical=new URL(sourceUrl);canonical.search='';canonical.hash='';sourceUrl=canonical.href;
    const description=String(item.description??'');const summary=text(item['content:encoded']||description);
    const media=Array.isArray(item['media:content'])?item['media:content'][0]:item['media:content'];
    const imageUrl=safeUrl(media?.['@_url']||item.enclosure?.['@_url']||/<img\b[^>]*\bsrc=["']([^"']+)/i.exec(description)?.[1],true);
    const isPhoto=feed.kind==='photo';const caption=isPhoto?summary:text(media?.['media:description'],1500);
    const creator=text(item['dc:creator']||item.author,200);let category=feed.category;
    if(isPhoto)for(const[id,words]of Object.entries({olahraga:'liga|sepak bola|panahan|medali|atlet|pertandingan|timnas',ekonomi:'ekonomi|kur|umkm|pasar|kredit|bank|investasi',hiburan:'film|musik|konser|penyanyi',dunia:'gaza|palestina|ukraina|israel|amerika',otomotif:'mobil|otomotif|kendaraan',teknologi:'teknologi|digital|internet'})){if(new RegExp(`\\b(?:${words})\\b`,'iu').test(title)){category=id;break;}}
    output.push({id:'news-'+createHash('sha256').update(sourceUrl).digest('hex').slice(0,16),category,title,summary,content:summary,coverage:'excerpt',date:new Date(published).toISOString().replace('.000Z','+00:00'),source:feed.publisher,sourceUrl,feedUrl:feed.url,author:creator||feed.publisher,authorProvided:!!creator,imageUrl,imageCaption:caption||`Foto dari feed ${feed.publisher}. Hak foto mengikuti sumber.`,photos:imageUrl?[{url:imageUrl,caption:caption||summary,credit:feed.publisher}]:[],isPhoto,tags:[feed.publisher,category]});
    if(output.length===40)break;
  }
  if(!output.length)throw new Error('Empty RSS');return output;
}
async function boundedBody(response,maximum=2_000_000){
  if(Number(response.headers.get('content-length'))>maximum)throw new Error('Feed too large');
  const chunks=[];let size=0;const reader=response.body.getReader();
  try{while(true){const{value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>maximum)throw new Error('Feed too large');chunks.push(value);}return Buffer.concat(chunks).toString('utf8');}finally{await reader.cancel().catch(()=>{});}
}
export class NewsService{
  constructor({cache=null,fetcher=fetch,initial=seed,now=Date.now}={}){this.cache=cache;this.fetcher=fetcher;this.current=structuredClone(initial);this.now=now;this.archive=new Map(initial.articles.map(a=>[a.id,a]));this.pending=null;}
  async cached(key){try{return await this.cache?.get(key)??null;}catch{return null;}}
  async save(key,value,ttl){try{await this.cache?.set(key,value,{ttl});}catch{/* Cache loss must not turn real news into demo content. */}}
  async snapshot(){
    if(this.pending)return this.pending;
    if(this.current.meta.checkedAt&&this.now()/1000-this.current.meta.checkedAt<600)return this.current;
    this.pending=(async()=>{
      const cached=await this.cached('snapshot-v1');
      if(cached?.schemaVersion===1&&Array.isArray(cached.articles)&&cached.articles.length){this.current=cached;for(const a of cached.articles)this.archive.set(a.id,a);if(this.now()/1000-cached.meta.checkedAt<600)return cached;}
      const old=this.current;const grouped=new Map(sources.map(feed=>[feed.id,old.articles.filter(a=>a.feedUrl===feed.url)]));
      const health=new Map((old.meta.feeds??[]).map(feed=>[feed.id,feed]));let successful=0;let next=0;
      const worker=async()=>{while(next<sources.length){const feed=sources[next++];try{
        const response=await this.fetcher(feed.url,{redirect:'error',signal:AbortSignal.timeout(8000),headers:{'User-Agent':'Kabarin/1.0 (public RSS reader; cached 10 minutes)'}});if(!response.ok)throw new Error('Source unavailable');
        const items=parseFeed(await boundedBody(response),feed,this.now());grouped.set(feed.id,items);health.set(feed.id,{id:feed.id,checked:Math.floor(this.now()/1000),success:Math.floor(this.now()/1000),error:null,count:items.length});successful++;
      }catch{health.set(feed.id,{id:feed.id,success:0,count:grouped.get(feed.id)?.length??0,...health.get(feed.id),checked:Math.floor(this.now()/1000),error:'SOURCE_UNAVAILABLE'});}}};
      await Promise.all(Array.from({length:6},worker));
      // Match source ordering used by the Laragon adapter when two feeds link to one article.
      const unique=new Map();for(const feed of sources)for(const a of grouped.get(feed.id)??[])unique.set(a.id,a);
      const articles=[...unique.values()].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id));for(const a of articles)this.archive.set(a.id,a);
      const feeds=[...health.values()];const snapshot={schemaVersion:1,articles,meta:{updatedAt:successful?new Date(this.now()).toISOString():old.meta.updatedAt,checkedAt:Math.floor(this.now()/1000),stale:!successful||feeds.some(f=>f.error),feeds,publishers:['ANTARA News','CNN Indonesia','CNBC Indonesia'],coverage:'excerpt',storage:'vercel-cache'}};
      this.current=snapshot;
      const previous=await this.cached('archive-v1');if(Array.isArray(previous))for(const a of previous)if(validId(a.id)&&!this.archive.has(a.id))this.archive.set(a.id,a);
      const archive=[];let archiveBytes=2;
      for(const article of [...this.archive.values()].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,1000)){const size=Buffer.byteLength(JSON.stringify(article))+1;if(archiveBytes+size>1800000)break;archiveBytes+=size;archive.push(article);}this.archive=new Map(archive.map(a=>[a.id,a]));
      await Promise.all([this.save('snapshot-v1',snapshot,86400),this.save('archive-v1',archive,2592000)]);
      return snapshot;
    })();
    try{return await this.pending;}finally{this.pending=null;}
  }
  async find(ids){
    if(ids.some(id=>!this.archive.has(id))){const previous=await this.cached('archive-v1');if(Array.isArray(previous))for(const a of previous)if(validId(a.id))this.archive.set(a.id,a);}
    return ids.map(id=>this.archive.get(id)).filter(Boolean);
  }
  async catalog(){
    // A chat round reads the cache already filled by the news endpoint; no 18-feed refresh under a session lease.
    const [cached,archived]=await Promise.all([this.cached('snapshot-v1'),this.cached('archive-v1')]);
    if(Array.isArray(archived))for(const a of archived)if(validId(a.id))this.archive.set(a.id,a);
    if(cached?.schemaVersion===1&&Array.isArray(cached.articles))for(const a of cached.articles)if(validId(a.id))this.archive.set(a.id,a);
    return [...this.archive.values()].map(a=>{const{content,photos,imageCaption,...metadata}=a;return {...metadata,ageMinutes:Math.max(0,Math.floor((this.now()-Date.parse(a.date))/60000)),readTime:1};});
  }
}
const runtimeCache=process.env.VERCEL?getCache({namespace:'kabarin-news-v1'}):null;
export const news=new NewsService({cache:runtimeCache});

export async function newsResponse(request,service=news){
  const headers={'X-Content-Type-Options':'nosniff'};
  if(request.method!=='GET')return Response.json({error:'METHOD_NOT_ALLOWED'},{status:405,headers:{...headers,Allow:'GET','Cache-Control':'no-store'}});
  const params=new URL(request.url).searchParams;let payload;
  if([...params.keys()].some(key=>key.startsWith('ids[')))return Response.json({error:'INVALID_IDS'},{status:422,headers:{...headers,'Cache-Control':'no-store'}});
  if(params.has('ids')){
    const ids=params.get('ids').split(',');if(params.getAll('ids').length!==1||ids.length>100||!ids.every(validId))return Response.json({error:'INVALID_IDS'},{status:422,headers:{...headers,'Cache-Control':'no-store'}});
    payload={schemaVersion:1,articles:await service.find([...new Set(ids)])};
  }else payload=await service.snapshot();
  const status=payload.articles.length||params.has('ids')?200:503;
  return Response.json(payload,{status,headers:{...headers,'Cache-Control':status===200?'public, max-age=60':'no-store','Vercel-CDN-Cache-Control':status===200?`s-maxage=${payload.meta?.stale?30:600}, stale-while-revalidate=3600`:'no-store'}});
}
