import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {postgresPoolOptions} from '../server/postgres-store.mjs';
let pool;
try{
  pool=new Pool({...postgresPoolOptions(process.env.DATABASE_URL),max:1});
  pool.on('error',()=>{});
  const sql=await readFile(new URL('../database/kabarin-pagesquire.sql',import.meta.url),'utf8');
  await pool.query(sql);
  console.log('Siap: schema kabarin_pagesquire, tabel sessions dan rate_limits. Tabel project lain tidak diubah.');
}catch(error){
  const known={
    SELF_SIGNED_CERT_IN_CHAIN:'Sertifikat CA database belum dipercaya. Pastikan bundle server/certs ikut pada source.',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE:'Rantai sertifikat database belum bisa diverifikasi.',
    ERR_TLS_CERT_ALTNAME_INVALID:'Hostname database tidak cocok dengan sertifikat TLS.',
    CERT_HAS_EXPIRED:'Sertifikat database kedaluwarsa.',
    '28P01':'Autentikasi database gagal. Periksa username dan password database pada DATABASE_URL.',
    '42501':'Role database belum memiliki izin membuat atau mengelola schema Kabarin.',
    ENOTFOUND:'Host database tidak dapat ditemukan. Salin connection string dari Supabase Connect.',
    ECONNREFUSED:'Koneksi pooler ditolak. Periksa host, port dan status database.'
  };
  const message=error?.code==='INVALID_STORE'?error.message:known[error?.code]||'Setup database gagal. Periksa connection string Transaction Pooler, password, TLS dan izin membuat schema. Bisa juga jalankan database/kabarin-pagesquire.sql melalui Supabase SQL Editor.';
  console.error(message);process.exitCode=1;
}finally{if(pool)await pool.end().catch(()=>{});}
