import Ajv from 'ajv-draft-04';
import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile(new URL('../vercel.json',import.meta.url),'utf8'));
const response=await fetch('https://openapi.vercel.sh/vercel.json',{signal:AbortSignal.timeout(15000)});
if(!response.ok)throw new Error('Official Vercel schema is unavailable.');
const remote=await response.json();
// The official draft-04 schema currently mixes a newer exclusiveMinimum form in
// unused experimentalTriggers branches. Validate every configured property only.
if(Object.values(config.functions??{}).some(value=>value.experimentalTriggers))throw new Error('Experimental trigger schema needs separate review.');
const properties=Object.fromEntries(Object.keys(config).map(key=>{
  if(!remote.properties?.[key])throw new Error('Unknown Vercel option: '+key);
  return [key,structuredClone(remote.properties[key])];
}));
delete properties.functions.patternProperties['^.{1,256}$'].properties.experimentalTriggers;
const validate=new Ajv({strict:false,validateFormats:false}).compile({type:'object',additionalProperties:false,properties,definitions:remote.definitions});
if(!validate(config))throw new Error(JSON.stringify(validate.errors));
console.log('PASS: all configured Vercel fields match the official schema; unused experimental branches excluded.');
