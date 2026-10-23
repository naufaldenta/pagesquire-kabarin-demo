import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:net';
const execute=promisify(execFile),root=path.resolve(import.meta.dirname,'..');
const windows=process.platform==='win32',suffix=windows?'.exe':'';
const directory=await mkdtemp(path.join(tmpdir(),'kabarin-pg-test-')),data=path.join(directory,'cluster');
const bin=process.env.PG_BIN||(windows?'C:/laragon/bin/postgresql/postgresql/bin':'');
const executable=name=>bin?path.join(bin,name+suffix):name;
let started=false;
try{
  if(bin)await access(executable('pg_ctl'));
  await mkdir(data);
  await execute(executable('initdb'),['-D',data,'-U','kabarin_test','--auth=trust','--encoding=UTF8','--no-locale'],{windowsHide:true,timeout:30000});
  const socket=createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
  const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
  await execute(executable('pg_ctl'),['start','-w','-t','30','-D',data,'-l',path.join(directory,'postgres.log'),'-o',`-h 127.0.0.1 -p ${port} -c max_connections=12 -c fsync=off`],{windowsHide:true,timeout:40000});started=true;
  const result=await execute(process.execPath,['--test','tests/postgres.test.mjs'],{cwd:root,windowsHide:true,timeout:90000,maxBuffer:2000000,env:{...process.env,PAGESQUIRE_TEST_DATABASE_URL:`postgresql://kabarin_test:local-test-only@127.0.0.1:${port}/postgres?sslmode=disable`,PAGESQUIRE_TEST_CLUSTER_DIR:data}});
  process.stdout.write(result.stdout);process.stderr.write(result.stderr);
}catch(error){
  // Only an isolated disposable cluster is used. Never consume DATABASE_URL from .env.
  if(error.stdout)process.stdout.write(error.stdout);
  if(error.stderr)process.stderr.write(error.stderr);
  console.error('PostgreSQL QA gagal. Pastikan PostgreSQL tersedia; PG_BIN dapat menunjuk folder bin PostgreSQL.');process.exitCode=1;
}finally{
  let safeToRemove=true;
  if(started){try{await execute(executable('pg_ctl'),['stop','-w','-t','15','-D',data,'-m','fast'],{windowsHide:true,timeout:20000});}catch{safeToRemove=false;console.error('Cluster QA belum berhenti; folder temporary dipertahankan.');process.exitCode=1;}}
  const target=path.resolve(directory),parent=path.resolve(tmpdir())+path.sep;
  if(!target.startsWith(parent)||!path.basename(target).startsWith('kabarin-pg-test-'))throw new Error('Unsafe PostgreSQL QA cleanup target');
  if(safeToRemove)await rm(target,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
