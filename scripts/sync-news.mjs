import {writeFile} from 'node:fs/promises';
import {NewsService,seed} from '../server/news.mjs';
const initial=process.argv.includes('--force')?{...seed,meta:{...seed.meta,checkedAt:0}}:seed;
const snapshot=await new NewsService({initial}).snapshot();
if(!snapshot.articles.length||snapshot.meta.stale){console.error('Feed unavailable: '+snapshot.meta.feeds.filter(feed=>feed.error).map(feed=>feed.id).join(', ')+'. Existing real fallback snapshot preserved.');process.exit(1);}
await writeFile(new URL('../integration/news/seed.json',import.meta.url),JSON.stringify(snapshot));
console.log(`Saved ${snapshot.articles.length} actual articles from ${snapshot.meta.feeds.length} feeds. No database used.`);
