# Kabarin — Portal Berita

## Public PageSquire integration demo

[Open the live demo](https://pagesquire-kabarin-demo.vercel.app/) · [GitHub source](https://github.com/naufaldenta/pagesquire-kabarin-demo)

The public deployment uses Node.js/Vercel and the existing private Supabase PostgreSQL schema, not the local PHP adapter. No password is required. The server allows **5 new user messages per trusted network per UTC day** (reset at **07:00 WIB**); action-result continuations and exact cached retries do not consume extra message slots. It separately caps model dispatch at 25/network/day and 100/site/day, and new messages at 50/site/day. Failed attempts remain charged. No automatic paid retries or fallback providers are enabled.

Network identities are HMAC pseudonyms. Raw IP addresses are not stored in quota rows; expired counters are removed by bounded lazy cleanup after daily expiry. Conversations retain the existing 15-minute expiry. Browser incognito is not detected or fingerprinted: a fresh cookie/private window/new conversation on the same network keeps the shared daily limit. Shared NAT users share quota; a VPN or different network can obtain another network allowance. This is abuse mitigation, **not a verified human identity or complete bot defense**. Site-wide model limits remain the final cost bound. Vercel/provider platform logging has its own retention policy.

Local shortcuts, guided tours and ordinary portal navigation do not use paid AI. Do not submit personal information. See [deployment setup](VERCEL.md) for server-only environment variables. PageSquire and bundled dependencies retain their own licenses; publisher headlines/excerpts/images and third-party photographs/fonts are not relicensed by this demo.

Agregator berita Indonesia dengan UI editorial responsif dan chatbot PageSquire + SumoPod, **tanpa SQLite/MySQL**. Konten produksi berasal dari sumber nyata, bukan dataset demo. Buka **http://localhost/tes_openclaw/** dengan Apache/PHP Laragon aktif. Untuk hosting Node.js Vercel, ikuti [VERCEL.md](VERCEL.md); backend PHP hanya dipakai Laragon. Setelah pembaruan frontend, gunakan **Ctrl+F5**.

Jika membuka `C:/laragon/www/tes_openclaw/index.html` langsung (`file://`), berita tetap tampil dari `assets/news-snapshot.js`: snapshot asli515artikel yang ikut frontend. Mode ini tidak menjalankan API atau chat server dan menampilkan **Data tersimpan**. Gunakan alamat localhost di atas untuk pembaruan API dan chat AI. Snapshot dimuat dahulu; saat dibuka lewat HTTP, API memperbarui datanya di latar belakang tanpa membuat halaman kosong atau mengganti artikel yang sedang dibaca.

## Data berita

Data berasal dari 18 feed publik penerbit:

- [ANTARA News RSS](https://www.antaranews.com/rss): nasional, dunia, ekonomi, teknologi, olahraga, gaya hidup, otomotif, hiburan, foto.
- [CNN Indonesia RSS Nasional](https://www.cnnindonesia.com/nasional/rss), serta feed internasional, ekonomi, teknologi, olahraga, gaya hidup dan hiburan.
- [CNBC Indonesia RSS Opini](https://www.cnbcindonesia.com/opini/rss): kolom dan analisis.

Server mengonversi RSS resmi tersebut menjadi **API JSON same-origin**. Berita tidak memerlukan API key atau database. Laragon memakai PHP; Vercel memakai fungsi Node24. Probe awal menghasilkan **515 berita unik**, sembilan kategori minimal20, dan lima koleksi masing-masing20. Jumlah serta tanggal mengikuti feed, bukan dipaksakan dengan berita rekaan.

Alternatif yang diperiksa: API Berita Indonesia Vercel mengembalikan 402 pada pemeriksaan sehingga tidak digunakan; GNews/NewsData memerlukan key dan memiliki batas paket. The Conversation Atom tersedia, tetapi cakupan sumber Indonesia terpilih sudah mencukupi. Ini bukan klaim semua layanan alternatif tidak tersedia selamanya.

Feed umumnya hanya berisi **judul, tanggal, foto, dan cuplikan**. Halaman detail mempertahankan layout pembaca dan menampilkan cuplikan asli, kredit sumber, serta tombol **Baca berita lengkap di sumber**. Kabarin tidak membuat naskah, penulis, kutipan atau angka pembaca untuk mengisi bagian yang tidak disediakan. Artikel lengkap/hak foto tetap mengikuti penerbit; tidak melewati paywall atau mengambil seluruh naskah situs secara massal.

## Fitur yang dipertahankan

- Beranda sorotan, sekilas kabar, pilihan editor, kabar terbaru, ragam perspektif, opini dan Lensa Kabarin.
- Sembilan kategori; pencarian judul/cuplikan/topik/penerbit, filter, pengurutan, pagination dan muat lainnya.
- Halaman detail, salin tautan internal, simpan artikel, ukuran bacaan, indikator baca, tema terang/gelap dan menu mobile.
- Galeri foto tetap tersedia. Jumlah foto mengikuti feed—umumnya satu foto per berita foto—dengan caption asli; tidak menambah lima foto ilustrasi yang tidak berhubungan.
- **Terpopuler** memakai hitungan artikel yang dibuka pada browser ini. Jika belum ada hitungan, urutannya berita terbaru. Ini bukan statistik pembaca global milik penerbit. Hitungan lokal tidak dikirim sebagai analytics.
- **Pilihan Editor** adalah seleksi otomatis lintas kategori/sumber, bukan klaim kurasi redaksi Kabarin. Topik diambil dari kata yang sering muncul pada headline aktual.
- Nama penulis hanya dipakai jika disediakan feed; jika tidak, nama penerbit ditampilkan. Avatar berupa inisial, bukan wajah penulis fiktif.
- Newsletter dan formulir kontak tetap berupa demo lokal yang jelas diberi label; tidak mengirim email atau pesan.

## API dan cache tanpa SQLite

Endpoint publik:

```text
GET /tes_openclaw/api/news.php
GET /tes_openclaw/api/news.php?ids=news-0123456789abcdef
```

Respons memuat `articles` dan metadata sinkronisasi/cakupan. `?ids=` menerima sampai 100 ID valid untuk membaca arsip. Metode selain GET dan ID tidak valid ditolak. URL remote/selector tidak diterima sebagai parameter.

**Laragon:** cache JSON berada di `%LOCALAPPDATA%/Kabarin/News/news.json` (fallback temporary sistem), di luar web root, ditulis atomik di bawah lock. PHP hanya memerlukan cURL, SimpleXML dan mbstring. SQLite lama tidak lagi dibaca atau ditulis; tidak perlu menyalakan MySQL.

**Vercel:** empat fungsi Node24 menggantikan endpoint PHP. Berita memakai cache CDN, Runtime Cache dan snapshot asli `integration/news/seed.json`, tanpa menulis database atau mengandalkan `/tmp`. Arsip cache dibatasi hingga1000 artikel/1,8MB dengan TTL30hari dan bersifat best effort, bukan arsip permanen. Bookmark menyimpan salinan cuplikan di browser (maksimal500), sehingga tetap bisa dibaca ketika cache hilang atau koneksi putus. Tautan artikel lama di perangkat lain dapat tidak tersedia setelah keluar dari cache/snapshot.

- Berita diperbarui saat API diakses dan cache sudah berumur 10 menit. Tidak ada cron atau proses Node yang wajib berjalan.
- Request bersamaan dilindungi lock. Pengambilan feed dibatasi waktu/ukuran, HTTPS, dan endpoint yang ditentukan pemilik situs.
- Kegagalan satu feed tidak menghapus data real terakhir dari feed itu. Header **Data tersimpan** dan tooltip menampilkan kondisi cache; tanggal terbit artikel tetap tanggal penerbit.
- Jika belum pernah ada snapshot berhasil, UI menampilkan keadaan gagal/muat ulang, bukan berita dummy.
- Identitas `news-…` berasal dari hash URL penerbit, bukan nomor urut feed. Arsip JSON lokal menyimpan hingga6000 artikel; Vercel mengikuti batas cache di atas. Bookmark dan tautan detail tidak tertukar ketika feed berubah. Deep link/AI dapat mengambil arsip yang masih tersedia.
- Gambar dimuat dari CDN penerbit tanpa referrer. Gambar gagal/tidak tersedia memakai placeholder bertuliskan keadaan sebenarnya, bukan foto lain yang diklaim mendokumentasikan berita.

Sinkronisasi manual dan pembaruan snapshot pengujian:

```sh
npm run news:sync
php scripts/sync-news.php --force
# Node / Vercel: refresh snapshot real yang ikut Git, kemudian build.
npm run news:sync:node -- --force
npm run build
```

Untuk menambah sumber, edit `integration/news/sources.json` dan tinjau parser, pemetaan kategori, hak penggunaan dan allowlist URL di `FeedParser.php`. Feed foto dikelompokkan dengan kata kunci judul jika tidak memberi kategori; kategorinya merupakan pengelompokan Kabarin.

## Kabarin AI

Konfigurasi SumoPod pengguna dipertahankan; bagian Supabase kosong ditambahkan ke `.env`. API key SumoPod dan connection string database hanya dibaca server. Node/Vercel kini mendukung **Supabase Transaction Pooler dengan `DATABASE_URL` saja**: isi URL lengkap port6543, lalu `npm run db:setup` satu kali. Schema `kabarin_pagesquire` terpisah dari tabel project lain di database yang sama. Lihat [SUPABASE.md](SUPABASE.md) untuk setup, uji Node lokal dan cara berbagi database. Laragon PHP tetap memakai file privat; Vercel memakai `.env.vercel.example` di dashboard. Redis lama masih opsional, tidak diperlukan dengan PostgreSQL. Tanpa store yang valid, portal dan pintasan tetap aktif, sedangkan chat berbayar dinonaktifkan dengan jelas. Jangan menaruh key dalam JavaScript. `.htaccess` melindungi source lokal; Vercel hanya menerbitkan allowlist `dist/` dan empat fungsi API.

Contoh perintah:

- “Buka satu berita teknologi terbaru lalu telusuri dan rangkum isinya.”
- “Rangkum artikel ini.”
- “Gulir artikel ini ke bawah lalu atas.”
- “Sorot artikel ini.”
- “Buka kategori ekonomi”, “Simpan artikel ini”, “Perbesar teks”, “Aktifkan mode gelap”.

Katalog asisten dibaca dari cache berita **yang sama** pada setiap ronde. Perubahan artikel tidak membutuhkan build ulang. Navigasi eksplisit tetap memakai resolver, capability dan verifier PageSquire. Permintaan majemuk mempertahankan tujuan buka → baca → rangkum; ringkasan hanya memakai cuplikan yang benar-benar dibaca dan selalu diberi penjelasan batas cakupan.

Tiga belas capability mencakup pencarian, kategori, artikel, koleksi, beranda, tersimpan, bookmark, tema, ukuran teks, navigasi bagian, baca, scroll dan highlight. Kursor/outline/efek klik mengikuti target nyata. Timeline menampilkan progres runtime, bukan persentase/keberhasilan buatan. Tombol Hentikan membatalkan langkah yang sedang berjalan; efek yang sudah selesai tidak di-undo.

Tur singkat Bahasa Indonesia berjalan tanpa inference. Suara awalnya mati dan hanya bisa aktif jika browser menyediakan voice Indonesia lokal; tidak memakai mikrofon/TTS cloud. Pada browser QA, voice itu belum tersedia sehingga fallback ditampilkan. Motion mengikuti preferensi reduced motion. Panel mobile mengecil saat driving agar artikel tetap terlihat.

PageSquire memakai commit `2e91675605156c73c0a5f553086fec5996573d82`, alpha `0.1.0-alpha.0`. Lima paket terpilih: protocol/core/client, server Node untuk Vercel, dan server PHP untuk kompatibilitas Laragon. Bundle Node portabel beserta lisensi ada di `server/vendor/` dan harus ikut Git karena `.vendor/` diabaikan. React, Laravel, WordPress, CLI, inspector publik, avatar berlisensi dan TTS komersial tidak dipasang. Provenance: `integration/pagesquire-source.json`.

## Privasi dan sesi

Preferensi, bookmark beserta salinan cuplikannya, hitungan buka artikel dan newsletter demo berada di localStorage (`kabarin:theme`, `kabarin:saved`, `kabarin:saved-articles`, `kabarin:reads`, `kabarin:newsletter`). Riwayat tampilan chat berada di memori, bukan localStorage.

Saat AI digunakan, pesan, teks publik halaman/cuplikannya, jenis halaman, ID artikel publik, tema, ukuran baca dan cakupan konten diteruskan ke SumoPod. Form newsletter/UI chat dikecualikan. Jangan membagikan data pribadi. Header API sesi hanya membagikan status, URL endpoint dan CSRF—bukan provider key.

Laragon PHP menyimpan transcript di `PAGESQUIRE_STORAGE_DIR` di luar web root; sesi15menit dan expiry tidak otomatis menghapus file. Node/Vercel menyimpan checkpoint sesi di PostgreSQL (atau Redis opsional) dengan expiry15menit, cookie bertanda tangan HttpOnly/SameSite/Secure dan lock terdistribusi dengan fencing. PostgreSQL membersihkan baris kedaluwarsa bertahap saat ada traffic. **Percakapan baru** menghapus transcript sambil mempertahankan budget. Origin/CSRF/sesi/schema/izin diperiksa pada kedua runtime; context browser tidak memberi izin server. Store tidak menyimpan provider key.

Laragon default loopback/origin `http://localhost`. Vercel perlu `PAGESQUIRE_ALLOW_REMOTE=true`; origin berasal dari environment deployment yang tepercaya atau `PAGESQUIRE_ORIGIN` eksplisit. Default20 request protokol/menit/sesi dan engine8aksi/12percobaan; Vercel juga membatasi120request/menit/situs serta40/IP. Satu tujuan dapat memakai beberapa request. Ini bukan batas saldo provider.

## Pengembangan dan pengujian

```sh
npm run news:sync
npm run check
npm run build
npm run test:node
npm run test:postgres
npm run test:news
npm run test:news:http
npm run test:assistant
npm run test:navigation
npm run test:reading
npm run test:assistant:http
```

Tes parser/cache memakai transport lokal tanpa jaringan; meliputi markup/namespace foto, deduplikasi URL, TTL, arsip stabil, sumber mati dan penolakan XML/URL berbahaya. Pemeriksaan dataset memakai snapshot real terakhir, memeriksa minimum data, foto/atribusi, ID dan hitungan lokal. Fixture dummy lama di `tests/fixtures/` hanya untuk regresi protokol; tidak dipakai situs produksi dan tidak dilayani Apache.

Build chatbot setelah mengubah source UI/capability:

```sh
npm ci
composer install --no-dev --no-scripts
composer dump-autoload --no-scripts
npm run build:assistant
```

Setelah pull upstream, jalankan `composer reinstall pagesquire/server --no-scripts --no-interaction` sebelum build agar mirror PHP turut diperbarui. Browser/server schema harus berasal dari commit yang sama. Build tidak mengunduh berita atau menanam katalog demo dalam bundle.

`tests/router.php` adalah fixture loopback dengan provider tiruan, terpisah dari endpoint produksi. Jalankan manual dengan `php -S 127.0.0.1:4187 -t . tests/router.php`, lalu hentikan setelah QA. Fixture membaca berita real dari cache tetapi jawaban modelnya jelas diberi label simulasi. Test live `php tests/live-summary.php --live` bersifat opt-in, membutuhkan input DOM artikel publik di `.build/live-summary-input.json`, dan memakai saldo SumoPod; tidak dijalankan otomatis oleh tes reguler.

Validasi terbaru: **27 tes Node** lulus; **7 tes PostgreSQL native** sudah lulus pada tahap implementasi, beserta sintaks, dataset515artikel, build portabel dan schema konfigurasi Vercel resmi. PostgreSQL lokal menguji migrasi idempotent, pemisahan project, commit checkpoint, concurrency, stale lease fencing, expiry, budget, cleanup, buka/baca/rangkum, reset dan replay sesudah provider gagal. Cluster QA dihentikan dan dibersihkan.

Pada24Oktober2026 pengguna mengisi DATABASE_URL. `npm run db:setup` dan `npm run db:check` berhasil pada Transaction Pooler Supabase nyata, termasuk TLS dengan CA resmi, dua tabel/RLS, checkpoint lintas koneksi, lease dan budget. Konfigurasi SumoPod/kredensial pengguna tidak diubah. Browser Node berhasil membuka berita, membaca cuplikan dan merangkum lewat satu completion SumoPod aktual; bukti `preview/kabarin-supabase-live.png`. Untuk menjalankan adapter Supabase lokal, gunakan `npm run dev` dan buka http://127.0.0.1:3000/; PHP Laragon tetap store file privat.

Validasi situs sebelumnya mencakup **94 pemeriksaan PHP**, HTTP, desktop/mobile dan satu completion SumoPod aktual melalui Node. Seluruh18tes cache juga lulus pada PHP tanpa PDO/SQLite. Tiga regresi pemuatan mencakup file tanpa API, API tertunda dan respons rusak yang tidak boleh menghapus snapshot. Browser memverifikasi alur Node buka/baca/rangkum serta bookmark sesudah reload dan mobile. Belum ada push/deployment Vercel atau koneksi database Supabase produksi dari workspace ini.

CSS utama dan struktur halaman dipertahankan; cuplikan panjang dibatasi secara visual pada hero. Versi URL aset mencegah campuran JavaScript lama/baru sesudah migrasi. Bukti tampilan: `preview/kabarin-real-news-desktop.png` dan `preview/kabarin-real-news-mobile.png`. Source utama: `data.js` (adapter API), `app.js` (UI/router), `integration/news/` (feed/cache), `api/news.php`, dan `integration/` (chatbot). Tutorial OpenClaw lama tetap dipertahankan.
