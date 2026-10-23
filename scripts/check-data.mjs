import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
const payload=JSON.parse(await readFile(new URL('../integration/news/seed.json',import.meta.url),'utf8'));
const memory=new Map();
const context={window:{},localStorage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},location:{hash:''},fetch:async()=>({ok:true,json:async()=>payload}),AbortSignal,URL};
vm.runInNewContext(await readFile(new URL('../data.js',import.meta.url),'utf8'),context);
const data=await context.window.KABARIN_READY;
assert.ok(data.articles.length>=180,'Real snapshot should have at least 20 items per category');
assert.equal(new Set(data.articles.map(a=>a.id)).size,data.articles.length,'Stable IDs must be unique');
assert.equal(new Set(data.articles.map(a=>a.sourceUrl)).size,data.articles.length,'Publisher URLs must be unique');
for(const category of data.categories){const count=data.articles.filter(a=>a.category===category.id).length;assert.ok(count>=20,`${category.name}: at least 20 actual articles`);console.log(`${category.name}: ${count} berita nyata`);}
for(const[name,items]of Object.entries(data.collections)){assert.ok(items.length>=20,`${name}: at least 20 real articles`);assert.equal(new Set(items.map(a=>a.id)).size,items.length);assert.ok(items.every(a=>data.get(a.id)));console.log(`${name}: ${items.length} berita nyata`);}
for(const article of data.articles){assert.match(article.id,/^news-[a-f0-9]{16}$/);assert.ok(article.title&&article.source&&article.sourceUrl&&article.date);assert.equal(article.coverage,'excerpt');assert.ok(Number.isFinite(Date.parse(article.date)));assert.match(article.sourceUrl,/^https:\/\//);assert.equal(article.views,0,'No invented read counts');assert.equal(article.photoCount,article.photos.length,'No invented photos');assert.ok(!article.avatar,'No invented author portraits');}
assert.ok(data.topics.length>=20,'Topics derived from real headlines');
data.recordView(data.mixed[0].id);assert.equal(data.get(data.mixed[0].id).views,1);assert.equal(data.collections.populer[0].id,data.mixed[0].id);
for(const weight of [400,500,600,700,800])await access(new URL(`../assets/fonts/jakarta-${weight}.ttf`,import.meta.url));
await access(new URL('../assets/news-placeholder.svg',import.meta.url));
console.log(`LULUS: ${data.articles.length} berita nyata, 9 kategori, 5 koleksi, ID stabil, atribusi dan hitungan lokal.`);
