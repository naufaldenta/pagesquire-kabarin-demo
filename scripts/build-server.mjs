import path from 'node:path';
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {build} from 'esbuild';
const root=path.resolve(import.meta.dirname,'..');
const upstream=path.join(root,'.vendor/pagesquire');
await mkdir(path.join(root,'server/vendor/licenses'),{recursive:true});
const providers=JSON.parse(await readFile(path.join(upstream,'packages/php/resources/providers.json'),'utf8'));
const result=await build({entryPoints:[path.join(upstream,'packages/server/src/index.ts')],outfile:path.join(root,'server/vendor/pagesquire.mjs'),bundle:true,format:'esm',platform:'node',target:'node24',legalComments:'eof',metafile:true,
  banner:{js:'/* PageSquire MIT; upstream commit 2e91675605156c73c0a5f553086fec5996573d82. See ./licenses/. */\nimport {createRequire as createNodeRequire} from "node:module";const require=createNodeRequire(import.meta.url);'},
  alias:{'@pagesquire/protocol':path.join(upstream,'packages/protocol/src/index.ts')},
  plugins:[{name:'provider-catalog',setup(builder){builder.onResolve({filter:/\/provider-presets\.js$/},()=>({path:'provider-catalog',namespace:'catalog'}));builder.onLoad({filter:/.*/,namespace:'catalog'},()=>({contents:`export default ${JSON.stringify(providers)};`,loader:'js'}));}}]});
await copyFile(path.join(upstream,'LICENSE'),path.join(root,'server/vendor/licenses/PAGESQUIRE-LICENSE.txt'));
for(const name of ['ajv','fast-uri','fast-deep-equal','json-schema-traverse','require-from-string']){
  for(const file of ['LICENSE','LICENSE.md']){try{await copyFile(path.join(root,'node_modules',name,file),path.join(root,'server/vendor/licenses',name+'-LICENSE.txt'));break;}catch{}}
}
await writeFile(path.join(root,'.build/server-meta.json'),JSON.stringify(result.metafile));
console.log('Portable PageSquire Node bundle ready; Vercel does not need the ignored sparse checkout.');
