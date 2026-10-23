import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {PostgresConversationStore,postgresPoolOptions} from '../server/postgres-store.mjs';

// Explicit opt-in command. Only disposable rows inside Kabarin's own schema are written.
const namespace=`kabarin:connection-check:${randomUUID()}`;
let first,second;
try{
  const options={...postgresPoolOptions(process.env.DATABASE_URL),max:1};
  first=new Pool(options);second=new Pool(options);
  first.on('error',()=>{});second.on('error',()=>{});
  const client=await first.connect();let tls;
  try{
    tls=client.connection.stream.authorized===true;
    assert.ok(options.ssl===false||tls,'TLS connection was not verified');
    const result=await client.query("SELECT count(*)::int AS count,bool_and(c.relrowsecurity) AS rls FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname='kabarin_pagesquire' AND c.relname IN ('sessions','rate_limits') AND c.relkind='r'");
    assert.equal(result.rows[0].count,2);assert.equal(result.rows[0].rls,true);
  }finally{client.release();}
  const a=new PostgresConversationStore({pool:first,namespace}),b=new PostgresConversationStore({pool:second,namespace});
  const value={principal:'connection-check',state:null,rate:{since:Math.floor(Date.now()/1000),count:1}};
  await a.transaction('disposable-session',async tx=>{assert.equal(await tx.load(),null);await tx.save(value);});
  await b.transaction('disposable-session',async tx=>{
    assert.deepEqual(await tx.load(),value);
    await assert.rejects(a.transaction('disposable-session',async()=>{}),error=>error.code==='BUSY');
  });
  await a.consumeBudget('disposable-budget',1);
  await assert.rejects(b.consumeBudget('disposable-budget',1),error=>error.code==='RATE_LIMITED');
  console.log(`PASS: koneksi ${tls?'TLS terverifikasi':'lokal'}, dua tabel dengan RLS, checkpoint lintas koneksi, lease dan rate limit.`);
}catch(error){
  console.error(error?.code==='INVALID_STORE'?error.message:'Pemeriksaan database gagal. Periksa koneksi, jalankan npm run db:setup dan pastikan role dapat mengakses tabel Kabarin.');process.exitCode=1;
}finally{
  if(first){
    try{
      await first.query('DELETE FROM kabarin_pagesquire.sessions WHERE app_id=$1',[namespace]);
      await first.query('DELETE FROM kabarin_pagesquire.rate_limits WHERE app_id=$1',[namespace]);
      console.log('Baris pemeriksaan sementara dibersihkan; data sesi pengguna tidak diubah.');
    }catch{console.error('Pembersihan baris pemeriksaan belum berhasil; baris tersebut akan kedaluwarsa.');process.exitCode=1;}
  }
  await Promise.all([first?.end().catch(()=>{}),second?.end().catch(()=>{})]);
}
