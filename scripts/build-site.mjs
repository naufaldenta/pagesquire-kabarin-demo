import {mkdir,copyFile,cp,readFile,writeFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
await mkdir(dist,{recursive:true});
// Explicit public allowlist: no .env, PHP, source, session, tests or dependency directories.
const entries=await readdir(dist);const allowed=new Set(['index.html','styles.css','app.js','data.js','assets']);
if(entries.some(name=>!allowed.has(name)))throw new Error('Unexpected file in dist; review before building.');
for(const file of ['index.html','styles.css','app.js','data.js'])await copyFile(path.join(root,file),path.join(dist,file));
const bundle=await readFile(path.join(root,'server/vendor/pagesquire.mjs'),'utf8');
if(!bundle.includes('ConversationEngine'))throw new Error('Commit the portable PageSquire server bundle before deploying.');
const seed=JSON.parse(await readFile(path.join(root,'integration/news/seed.json'),'utf8'));
if(!seed.articles.length||seed.articles.some(a=>a.coverage!=='excerpt'))throw new Error('An actual news snapshot is required.');
// Only reviewed public news fields enter the browser bootstrap; never server state/config.
const publicFields=['id','category','title','summary','content','coverage','date','source','sourceUrl','feedUrl','author','authorProvided','imageUrl','imageCaption','photos','isPhoto','tags'];
const snapshot={schemaVersion:1,articles:seed.articles.map(article=>Object.fromEntries(publicFields.map(key=>[key,article[key]]))),meta:{updatedAt:seed.meta.updatedAt,publishers:seed.meta.publishers,coverage:'excerpt',stale:true,origin:'bundled-snapshot'}};
const publicJs='/* Actual publisher excerpts bundled for immediate/offline loading; not demo data. */\nwindow.KABARIN_NEWS_SNAPSHOT=Object.freeze('+JSON.stringify(snapshot).replace(/</g,'\\u003c')+');\n';
await writeFile(path.join(root,'assets/news-snapshot.js'),publicJs);
await cp(path.join(root,'assets'),path.join(dist,'assets'),{recursive:true});
async function scan(directory){for(const entry of await readdir(directory)){const file=path.join(directory,entry);if((await stat(file)).isDirectory())await scan(file);else if(/(?:^\.env|\.(?:php|sqlite|db|log)$)/i.test(entry))throw new Error('Private file in public output: '+file);}}
await scan(dist);console.log(`Vercel static output ready: dist/; ${seed.articles.length} actual articles in the public bootstrap and server fallback. No PHP/SQLite/credentials copied.`);
