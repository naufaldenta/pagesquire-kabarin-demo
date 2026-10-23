# Supabase Transaction Pooler untuk Kabarin AI

Cukup satu kredensial database: **`DATABASE_URL`**, berupa connection string PostgreSQL lengkap dari **Supabase → Connect → Transaction pooler** (port **6543**). Tidak perlu project REST URL, anon key, service-role key, atau Redis. SumoPod tetap menggunakan konfigurasi provider yang sudah ada.

## Isi environment

Bagian ini sudah ditambahkan ke `.env` tanpa mengganti konfigurasi lamamu:

```dotenv
PAGESQUIRE_STORE=postgres
DATABASE_URL=
PAGESQUIRE_APP_ID=kabarin
```

Tempel URI lengkap pada `DATABASE_URL`. Bentuknya seperti ini; gunakan host dan username yang benar-benar disalin dari dashboard:

```dotenv
DATABASE_URL=postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@POOLER_HOST:6543/postgres?sslmode=require
```

Ganti password placeholder dengan **password database**, bukan API key. Karakter khusus dalam password harus di-percent-encode, misalnya `@` menjadi `%40` dan `#` menjadi `%23`. Jangan menambahkan awalan `NEXT_PUBLIC_` pada variabel ini. Koneksi remote memverifikasi sertifikat TLS; opsi untuk mematikan verifikasi tidak digunakan.

Shared pooler Supabase memakai CA tersendiri. Sertifikat publik resminya sudah dibundel di `server/certs/supabase-prod-ca-2021.crt`, khusus untuk hostname pooler Supabase. Tidak perlu variabel CA tambahan; verifikasi chain dan hostname tetap aktif. File ini harus ikut source saat push/deploy, dan sudah tercakup pada bundle fungsi Vercel. Sumber/fingerprint/masa berlaku tercatat di `server/certs/README.md`.

## Setup satu kali

Setelah URL diisi, jalankan dari folder proyek:

```sh
npm ci
npm run db:setup
npm run db:check
```

Perintah membuat schema **`kabarin_pagesquire`**, tabel **`sessions`** dan **`rate_limits`**, indeks dan pengaturan aksesnya. Aman dijalankan ulang. Perintah membutuhkan role pemilik/role yang boleh membuat schema, misalnya username pooler `postgres.PROJECT_REF` bawaan dashboard. Bila ingin memakai SQL Editor, jalankan seluruh isi `database/kabarin-pagesquire.sql` sebagai pengganti perintah setup. Build/deploy tidak menjalankan migrasi database otomatis.

`db:check` memeriksa TLS, keberadaan tabel/RLS, simpan-baca checkpoint lewat dua koneksi, lease dan budget. Perintah hanya membuat baris sementara dalam namespace pemeriksaan Kabarin dan menghapusnya setelah selesai; tidak mengubah sesi pengguna atau tabel project lain.

Schema ini tidak perlu ditambahkan ke Exposed schemas Data API. RLS diaktifkan, akses `PUBLIC`, `anon`, dan `authenticated` dicabut hanya pada objek Kabarin. Query server menggunakan role pemilik tabel. Tidak ada perubahan pada tabel/schema/izin project lamamu.

## Satu database untuk dua project

Bisa: project lama tetap memakai tabelnya sendiri, Kabarin memakai schema terpisah di atas. Namespace sesi juga memasukkan `PAGESQUIRE_APP_ID` serta environment Vercel (`production`/`preview`/`local`), dan identitas sesi mengikat origin. Dua project tidak membaca atau menimpa riwayat chat satu sama lain lewat aplikasi.

Ini pemisahan data aplikasi; role `postgres` tetap memiliki hak luas pada database yang sama. Kapasitas penyimpanan, koneksi dan komputasi paket Supabase tetap dibagi bersama kedua project. Berita memakai RSS/cache/snapshot seperti sebelumnya; bookmark tetap disimpan pada browser, tidak dipindahkan ke Supabase.

## Menjalankan

Untuk menguji adapter Supabase secara lokal:

```sh
npm run build
npm run dev
```

Buka **http://127.0.0.1:3000/** sesuai keluaran terminal. Node membaca `.env` dan memakai PostgreSQL. URL Laragon `http://localhost/tes_openclaw/` masih memakai backend PHP/file privat; membuka `index.html` langsung memakai snapshot berita dan mode panduan. Ketiga cara itu tetap didukung, tetapi hanya runtime Node/Vercel yang memakai adapter Supabase ini.

Di Vercel, isi variabel `.env.vercel.example` melalui **Settings → Environment Variables**: `DATABASE_URL`, `PAGESQUIRE_STORE=postgres`, `PAGESQUIRE_APP_ID=kabarin`, serta konfigurasi SumoPod dan `PAGESQUIRE_ALLOW_REMOTE=true`. Biarkan `PAGESQUIRE_ORIGIN` tidak dibuat untuk domain Vercel otomatis; custom domain harus diisi dengan origin tepat tanpa path/slash terakhir. Redeploy setelah perubahan environment. `.env` lokal tidak ikut dipush.

## Sesi dan pengujian

Checkpoint chat disimpan per langkah sebelum melanjutkan provider. Query memakai parameter tanpa named prepared statement, session advisory lock atau transaksi SQL panjang selama inference. Pool maksimal dua koneksi per instance, dengan integrasi lifecycle Vercel. Lease berdurasi120detik, dan owner lama tidak bisa menimpa/melepas lease baru. Reset chat mempertahankan budget permintaan.

Riwayat kedaluwarsa setelah15menit dan tidak dibaca lagi. Pembersihan oportunistik menghapus maksimal100sesi dan100bucket kedaluwarsa per menit per instance aktif; tanpa traffic, baris kedaluwarsa dapat tetap tersimpan sampai ada traffic berikutnya. Tidak perlu konfigurasi cron tambahan.

`npm run test:node` menguji konfigurasi, protokol dan regresi situs. `npm run test:postgres` membuat cluster PostgreSQL lokal sementara untuk menguji SQL asli, migrasi, isolasi, lock, expiry, budget, checkpoint, replay dan alur buka/baca/rangkum. PostgreSQL Laragon terdeteksi otomatis di Windows; mesin lain dapat mengisi `PG_BIN` dengan direktori bin PostgreSQL. Kedua suite ini tidak menggunakan `DATABASE_URL` pengguna. Sebaliknya, `npm run db:check` secara eksplisit memakai URL yang diisi.

Aktivasi24Oktober2026: `db:setup` dan `db:check` berhasil melalui Transaction Pooler Supabase pengguna dengan TLS terverifikasi. Schema/tabel dan store nyata sudah diuji.27tes Node serta build/check data515berita lulus; tujuh regresi SQL native sudah lulus pada tahap implementasi. Browser Node juga berhasil membuka berita, membaca cuplikan dan merangkum melalui SumoPod nyata. Bukti `preview/kabarin-supabase-live.png`. Deployment Vercel masih perlu dihubungkan ke akun pengguna.

Referensi: [koneksi Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres), [CA/TLS Supabase](https://supabase.com/docs/guides/platform/ssl-enforcement), [TLS node-postgres](https://node-postgres.com/features/ssl), [pool koneksi Vercel](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#attachdatabasepool).
