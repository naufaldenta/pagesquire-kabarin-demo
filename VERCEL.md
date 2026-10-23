# Deploy Kabarin ke Vercel tanpa SQLite

## Public demo security (2026-10-24)

Use the separate `naufaldenta/pagesquire-kabarin-demo` repository. Public production needs no access password, but it **must** have `PAGESQUIRE_SESSION_SECRET` and `PAGESQUIRE_QUOTA_SECRET` set to separate stable random secrets of at least 32 characters. Keep both in Vercel server-side environment variables, never public/frontend variables. Changing the quota secret resets network identities; do not rotate it merely to clear usage.

Use `PAGESQUIRE_STORE=postgres`, the owner's existing `DATABASE_URL`, `PAGESQUIRE_APP_ID=kabarin-demo`, `PAGESQUIRE_ALLOW_REMOTE=true`, and the existing environment-selected provider/API key/model. Leave `PAGESQUIRE_ORIGIN` unset on Vercel: origin is derived only from trusted Vercel system variables. Never copy a local `http://localhost` origin into production. No new database migration is required for daily quotas: the existing private `kabarin_pagesquire.rate_limits` table is reused with isolated hashed bucket names and the demo app namespace.

Vercel always enforces public-demo guards; setting `PAGESQUIRE_PUBLIC_DEMO=false` cannot disable them. Missing trusted client IP, daily store or secrets fails closed. Only Vercel's own `x-vercel-forwarded-for` is trusted; arbitrary visitor `X-Forwarded-For` is not an identity. IPv4-mapped IPv6 is normalized and IPv6 privacy addresses share their /64 network quota. Reference: [Vercel request headers](https://vercel.com/docs/headers/request-headers).

Limits: **5 messages/network/day**, **25 model attempts/network/day**, **50 messages/site/day**, **100 model attempts/site/day**, reset at 00:00 UTC / 07:00 WIB. PostgreSQL `INSERT ... ON CONFLICT ... WHERE` counters are atomic across instances. Limits are charged before work and are not refunded after failure/cancellation. Exact recorded replays and result continuations keep the same message allowance; each actual provider dispatch is independently charged. A site-wide cap can deny service before a network uses all five messages.

Private browsing is allowed under the same network quota, not detected. Cookie clearing/reset cannot restore quota; VPN/network changes and shared-NAT fairness remain limitations. Disable the assistant with `PAGESQUIRE_ALLOW_REMOTE=false` to contain an incident; do not delete counters or expose credentials. Do not enable function response caching. Frontend quota display is informative; only the database guard authorizes paid requests.

Before deployment run `npm run test:node`, `npm run test:postgres`, `npm run build:assistant`, `npm run build`, `npm run check` and `npm run check:vercel`. Tests use synthetic providers and an isolated disposable PostgreSQL cluster, not the owner's live inference/database. Keep `.env`, planning notes, research, previews and local tools out of Git and deployment uploads. Only the explicit `dist/` allowlist is public. A production GET/session/private-path smoke does not prove real-model accuracy; never silently spend an additional model-test budget.

Frontend dan seluruh fitur portal tetap sama. Endpoint berita dan chatbot di Vercel memakai **Node.js24**, bukan PHP. Database SQLite/MySQL tidak diperlukan. Laragon tetap berjalan dengan adapter PHP dan cache JSON lokal.

## Persiapan source

Push **folder proyek lengkap**, bukan hanya `dist/`. Pastikan yang ikut Git mencakup:

- `api/*.mjs`, `server/` termasuk **`server/vendor/pagesquire.mjs`, lisensinya dan sertifikat publik `server/certs/`**.
- `integration/capabilities.json`, `integration/news/sources.json`, `integration/news/seed.json`.
- HTML/CSS/JS, `assets/`, `scripts/build-site.mjs`, package/lock, `vercel.json`.

`.env`, dependency lokal, `.vendor/`, `.build/`, database lama dan sesi pribadi tidak perlu dipush. `.gitignore` dan `.vercelignore` sudah disiapkan. Bundle Node PageSquire sudah dibuat dari source resmi; build Vercel tidak membutuhkan Composer, PHP atau checkout upstream tersembunyi.

Jalankan sebelum push:

```sh
npm ci
npm run check
npm run build
npm run test:node
```

Untuk menyegarkan snapshot cadangan dari feed nyata, jalankan `npm run news:sync:node -- --force`, lalu commit `integration/news/seed.json`. Jika satu feed gagal, snapshot lama dipertahankan dan perintah menampilkan sumber yang gagal. Build tidak membutuhkan jaringan penerbit agar deployment tetap dapat selesai.

## Pengaturan project Vercel

1. Import repository Git ke Vercel dan pilih folder proyek ini sebagai Root Directory.
2. Framework Preset: **Other**. Node.js: **24.x** (juga dideklarasikan di package.json).
3. Build Command: **`npm run build`**. Output Directory: **`dist`**. Install Command bisa default npm.
4. `vercel.json` menyiapkan empat fungsi Node dan rewrite URL lama `api/*.php`. Jangan menambahkan runtime PHP komunitas atau mengubah project menjadi static-only.
5. Untuk berita dan pintasan asisten saja, langsung deploy. Database dan SumoPod belum diperlukan.

## Mengaktifkan chat SumoPod

Chat multi-langkah memerlukan penyimpanan sesi bersama karena request dapat dijalankan pada instance Vercel yang berbeda. Sekarang pilihan utama adalah **Supabase PostgreSQL Transaction Pooler**: cukup connection string, dan boleh memakai database project lain. Kabarin membuat schema `kabarin_pagesquire` tersendiri. Ikuti [SUPABASE.md](SUPABASE.md), isi `.env`, lalu jalankan **`npm run db:setup` satu kali** dan **`npm run db:check`** sebelum menggunakan chat. Berita tidak bergantung pada database ini. CA resmi pooler sudah dibundel untuk menjaga verifikasi TLS tanpa environment tambahan.

Isi di **Settings → Environment Variables**, untuk environment Production/Preview yang ingin diaktifkan:

| Variabel | Isi |
| --- | --- |
| `PAGESQUIRE_PROVIDER` | `sumopod` |
| `PAGESQUIRE_API_KEY` | API key SumoPod milikmu |
| `PAGESQUIRE_MODEL` | Model yang tersedia di akunmu, misalnya model yang dipakai lokal |
| `PAGESQUIRE_ALLOW_REMOTE` | `true` |
| `PAGESQUIRE_STORE` | `postgres` |
| `DATABASE_URL` | URI PostgreSQL Transaction Pooler port6543 dari Supabase Connect |
| `PAGESQUIRE_APP_ID` | `kabarin` |

Tidak perlu Supabase REST URL/anon/service-role key. Username dan password database sudah terdapat di `DATABASE_URL`; karakter khusus password harus di-percent-encode. Semua kredensial hanya berada di server; jangan beri awalan `NEXT_PUBLIC_` atau memasukkannya ke frontend. Adapter Redis lama tetap tersedia dengan `PAGESQUIRE_STORE=redis` dan `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (alias `KV_REST_API_URL`/`KV_REST_API_TOKEN`); PostgreSQL tidak membutuhkan variabel Redis.

`PAGESQUIRE_ORIGIN` bisa **tidak dibuat**: fungsi mengambil origin dari variabel deployment Vercel yang tepercaya, bukan header Host pengguna. Untuk custom domain, isi origin tepat seperti `https://kabarin.example.com`, tanpa path atau slash terakhir. Jangan menyalin nilai `http://localhost` dari `.env` Laragon. Preview dan production dapat memakai nilai berbeda.

Opsional: `PAGESQUIRE_SESSION_SECRET` minimal32karakter untuk signature sesi yang tetap stabil ketika provider key berubah. Jika kosong, key signature diturunkan dari provider key dengan pemisahan tujuan. Opsi token/timeout dan template lainnya ada di **`.env.vercel.example`**. Tidak perlu mengunggah `.env` lokal. Setelah mengubah environment, lakukan redeploy.

Tanpa konfigurasi provider/store yang valid, panel menampilkan mode panduan; pintasan navigasi, tur, highlight dan baca lokal tetap berjalan. Kredensial koneksi dan keberadaan tabel diperiksa saat request chat; kesalahan database menghentikan request sebelum provider dipanggil. Chat berbayar tidak dijalankan memakai penyimpanan sementara yang berisiko kehilangan langkah.

## Cara data disimpan

- **Berita:** snapshot asli dimuat segera melalui `assets/news-snapshot.js`, lalu API RSS18feed memperbaruinya di latar belakang. Cache CDN/Runtime Cache10menit. Snapshot ini juga menjaga frontend tampil bila API/cache bermasalah; tanggal dan status Data tersimpan tetap jujur. Mode `file://` menggunakan snapshot tanpa mencoba endpoint server.
- **Arsip Vercel:** cache hingga1000artikel/1,8MB, TTL30hari, dapat terhapus/tergusur; bukan arsip permanen. Tautan lama bisa tidak ditemukan setelah keluar dari feed, snapshot dan cache.
- **Bookmark:** ID dan salinan cuplikan hingga500berita disimpan di browser sendiri. Tetap bisa dibuka tanpa cache server/koneksi; membersihkan storage browser menghapusnya. Tidak tersinkron antarperangkat.
- **Chat:** PostgreSQL menyimpan checkpoint/riwayat di schema khusus dengan expiry15menit; baris kedaluwarsa dibersihkan bertahap saat ada traffic. Cookie bertanda tangan HttpOnly/SameSite/Secure mengikat sesi; origin, CSRF, schema, izin dan hasil aksi tetap diverifikasi. Reset percakapan mempertahankan budget. Redis tetap didukung sebagai pilihan lama.
- **Batas chat:** default20request protokol/menit/sesi,40/IP dan120/situs,8aksi/12percobaan. Request protokol berbeda dari jumlah completion berbayar. Lease120detik dilindungi owner dan conditional writes agar instance lama tidak menimpa state baru. Tidak ada koneksi/transaksi SQL yang ditahan selama inference.

## Verifikasi sesudah deploy

Buka `/api/news.php` dan pastikan respons JSON berita nyata. Buka panel AI dan periksa “AI siap menemani · SumoPod”, lalu coba “Buka satu berita teknologi terbaru lalu telusuri dan rangkum isinya”. Periksa bookmark sesudah reload dan tampilan mobile. Akses `/.env`, `/server/assistant.mjs` dan `/integration/news/seed.json` harus404.

Jika berita masih menampilkan Data tersimpan, periksa waktu sinkron dan ketersediaan penerbit; cache berisi berita real terakhir, bukan dummy. Jika chat belum aktif, periksa nama env, DATABASE_URL, setup tabel, origin dan redeploy. Rate/busy/error tidak memicu retry provider otomatis.

Validasi situs sebelumnya mencakup build tanpa `.vendor`/PHP/SQLite, 94 pemeriksaan PHP, HTTP, desktop/mobile, serta satu completion SumoPod aktual melalui Node. Regresi terbaru27tes Node lulus, dan tujuh regresi SQL native telah lulus menggunakan cluster temporary sendiri. Pada24Oktober2026, setup serta pemeriksaan checkpoint/lease/budget melalui Transaction Pooler Supabase pengguna berhasil dengan TLS terverifikasi. Deployment Vercel belum dihubungkan; tidak ada push/deployment eksternal dari workspace ini.

Referensi: [Node.js Vercel Functions](https://vercel.com/docs/functions/runtimes/node-js), [filesystem runtimes](https://vercel.com/docs/functions/runtimes), [Runtime Cache](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package#getcache), [Supabase Transaction Pooler](https://supabase.com/docs/guides/database/connecting-to-postgres).
