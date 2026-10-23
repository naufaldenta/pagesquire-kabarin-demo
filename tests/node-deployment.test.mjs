import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,cp,readdir,rm} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import os from 'node:os';
import {createPreview} from '../scripts/dev-server.mjs';
import {createAssistantHost} from '../server/assistant.mjs';
import {NewsService,seed,newsResponse} from '../server/news.mjs';
const execute=promisify(execFile);const root=path.resolve(import.meta.dirname,'..');
test('Vercel build is portable without PHP, SQLite, the sparse checkout or local credentials',async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),'kabarin-portable-'));
  try{
    await mkdir(path.join(directory,'scripts'));await mkdir(path.join(directory,'integration/news'),{recursive:true});
    for(const file of ['.gitignore','index.html','styles.css','app.js','data.js','scripts/build-site.mjs','integration/news/seed.json'])await cp(path.join(root,file),path.join(directory,file));
    await cp(path.join(root,'assets'),path.join(directory,'assets'),{recursive:true});await cp(path.join(root,'server'),path.join(directory,'server'),{recursive:true});
    await execute('git',['init','--quiet'],{cwd:directory});let ignored=false;
    try{await execute('git',['check-ignore','--quiet','server/vendor/pagesquire.mjs'],{cwd:directory});ignored=true;}catch(error){if(error.code!==1)throw error;}
    assert.equal(ignored,false,'Portable Node bundle must be included in a Git push');
    const result=await execute(process.execPath,[path.join(directory,'scripts/build-site.mjs')],{cwd:directory});assert.match(result.stdout,/No PHP\/SQLite\/credentials copied/);
    const output=await readdir(path.join(directory,'dist'));assert.deepEqual(output.sort(),['app.js','assets','data.js','index.html','styles.css']);
    const configuration=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));assert.equal(configuration.outputDirectory,'dist');assert.equal(configuration.rewrites.length,4);
    for(const file of ['news','assistant-session','assistant-chat','assistant-reset']){const handler=await import(`../api/${file}.mjs`);assert.equal(typeof handler.default.fetch,'function');}
  }finally{
    const target=path.resolve(directory),parent=path.resolve(os.tmpdir())+path.sep;
    if(!target.startsWith(parent)||!path.basename(target).startsWith('kabarin-portable-'))throw new Error('Unsafe test cleanup target');
    await rm(target,{recursive:true,force:true});
  }
});
test('Native Node HTTP serves the same frontend/API routes and protects private files',async()=>{
  const service=new NewsService({initial:{...seed,meta:{...seed.meta,checkedAt:Math.floor(Date.now()/1000)}}});
  const assistant=createAssistantHost({env:{PAGESQUIRE_ORIGIN:'http://localhost'}});
  const server=createPreview({news:request=>newsResponse(request,service),assistant});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const page=await fetch(base);assert.equal(page.status,200);const html=await page.text();assert.match(html,/data.js\?v=/);assert.ok(html.indexOf('assets/news-snapshot.js')<html.indexOf('src="data.js'),'The real snapshot must load before the adapter');
    assert.equal((await fetch(base+'/assets/news-snapshot.js')).status,200);
    for(const route of ['/api/news','/api/news.php']){const response=await fetch(base+route);assert.equal(response.status,200);assert.equal((await response.json()).articles.length,seed.articles.length);}
    const mode=await(await fetch(base+'/api/assistant-session.php')).json();assert.equal(mode.configured,false);assert.ok(mode.csrfToken.length>=32);
    for(const name of ['.env','.env.vercel.example','database/kabarin-pagesquire.sql','server/assistant.mjs','integration/news/seed.json','vendor/autoload.php','tests/node-preview.mjs','composer.lock'])assert.equal((await fetch(base+'/'+name)).status,404,name);
  }finally{await new Promise(resolve=>server.close(resolve));}
});
