import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import Ajv2020 from 'ajv/dist/2020.js';
import standaloneModule from 'ajv/dist/standalone/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const upstream = path.join(root, '.vendor/pagesquire');
const standaloneCode = standaloneModule.default ?? standaloneModule;
await mkdir('.build', { recursive: true });
await mkdir('assets/assistant', { recursive: true });
await build({ entryPoints: [path.join(upstream, 'packages/protocol/src/schemas.ts')], outfile: '.build/schemas.mjs', bundle: true, format: 'esm', platform: 'node' });
const { protocolSchemas } = await import(`${pathToFileURL(path.join(root, '.build/schemas.mjs')).href}?build=${Date.now()}`);

async function compile(schemas, output) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, ownProperties: true, code: { source: true, esm: true } });
  const exports = {};
  for (const [name, schema] of Object.entries(schemas)) { ajv.addSchema(schema); exports[name] = schema.$id; }
  await mkdir(path.dirname(output), { recursive: true });
  await build({ stdin: { contents: standaloneCode(ajv, exports), resolveDir: root, loader: 'js' }, bundle: true, format: 'esm', platform: 'browser', target: 'es2022', outfile: output, legalComments: 'inline' });
}
await compile(protocolSchemas, path.join(upstream, 'packages/protocol/src/generated/validators.js'));
for (const directory of [path.join(upstream, 'packages/php/resources/schemas'), 'vendor/pagesquire/server/resources/schemas']) {
  await mkdir(directory, { recursive: true });
  for (const [name, schema] of Object.entries(protocolSchemas)) await writeFile(path.join(directory, `${name}.json`), JSON.stringify(schema));
}
await build({ entryPoints: [path.join(upstream, 'packages/core/src/bindings.ts')], outfile: '.build/page-capabilities.mjs', bundle: true, format: 'esm', platform: 'node' });
const { createPageCapabilities } = await import(`${pathToFileURL(path.join(root, '.build/page-capabilities.mjs')).href}?build=${Date.now()}`);
const manifest = JSON.parse(await readFile('integration/capabilities.json', 'utf8'));
const pageCapabilities = createPageCapabilities(['article', 'page']);
manifest.capabilities = [...manifest.capabilities.filter(c => !pageCapabilities.some(p => p.id === c.id)), ...pageCapabilities];
await writeFile('integration/capabilities.json', JSON.stringify(manifest, null, 2) + '\n');
const parameterSchemas = Object.fromEntries(manifest.capabilities.map((capability, index) => [`p${index}`, { ...capability.inputSchema, $id: `urn:kabarin:parameters:${index}` }]));
await compile(parameterSchemas, '.build/parameters.mjs');
await writeFile('.build/parameter-bindings.mjs', `import * as validators from './parameters.mjs';\nimport manifest from '../integration/capabilities.json' with {type:'json'};\nexport const parameters = Object.fromEntries(manifest.capabilities.map((c,i)=>[c.id,{schema:c.inputSchema,validate:validators['p'+i]}]));\n`);
await build({ entryPoints: ['integration/assistant.js'], outfile: 'assets/assistant/assistant.js', bundle: true, format: 'iife', platform: 'browser', target: ['es2022'], minify: true, legalComments: 'eof', alias: { '@pagesquire/protocol': path.join(upstream, 'packages/protocol/src/index.ts'), '@pagesquire/core': path.join(upstream, 'packages/core/src/index.ts'), '@pagesquire/client': path.join(upstream, 'packages/client/src/index.ts') } });
await copyFile(path.join(upstream, 'LICENSE'), 'assets/assistant/PAGESQUIRE-LICENSE.txt');
await copyFile(path.join(upstream, 'packages/client/src/widget.css'), 'assets/assistant/pagesquire.css');
const commit = execFileSync('git', ['-C', upstream, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await import('./build-server.mjs');
await writeFile('integration/pagesquire-source.json', JSON.stringify({ repository: 'https://github.com/naufaldenta/pagesquire', commit, version: '0.1.0-alpha.0', packages: ['@pagesquire/protocol', '@pagesquire/core', '@pagesquire/client', '@pagesquire/server', 'pagesquire/server'], build: 'npm run build:assistant' }, null, 2) + '\n');
console.log(`PageSquire ${commit.slice(0, 12)}: 5 selected packages, ${manifest.capabilities.length} capabilities, browser + Node bundle + PHP schemas ready.`);
