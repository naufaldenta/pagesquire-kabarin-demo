/* Kabarin: same-origin news API, local preferences and PageSquire integration. */
window.KABARIN_APP_READY = (async () => {
  'use strict';
  await window.KABARIN_READY;
  const D = window.KABARIN;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const esc = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  const paths = {
    search: '<circle cx="10.8" cy="10.8" r="7.3"/><path d="m16 16 4.5 4.5"/>',
    bookmark: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
    'arrow-right': '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    'arrow-left': '<path d="M20 12H4m6-6-6 6 6 6"/>',
    'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
    'arrow-up': '<path d="M12 20V4m-6 6 6-6 6 6"/>',
    'chevron-right': '<path d="m9 5 7 7-7 7"/>',
    'chevron-left': '<path d="m15 5-7 7 7 7"/>',
    'chevron-down': '<path d="m5 9 7 7 7-7"/>',
    flame: '<path d="M13 3s1 4-2 7c-1-2-2-3-2-3s-5 4-5 8a8 8 0 0 0 16 0c0-4-3-8-7-12Z"/><path d="M12 14c-4 4-1 7 1 6 3-1 2-4-1-6Z"/>',
    sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM21 2v4m-2-2h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
    camera: '<path d="m8 6 1.5-3h5L16 6h4a1 1 0 0 1 1 1v12H3V7a1 1 0 0 1 1-1Z"/><circle cx="12" cy="12" r="3.5"/>',
    images: '<rect x="6" y="3" width="15" height="15" rx="2"/><path d="M3 7v14h14m-11-8 4-4 5 5 2-2 4 4"/><circle cx="16.5" cy="7.5" r="1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    x: '<path d="m6 6 12 12M6 18 18 6"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>',
    share: '<path d="M12 16V3m-5 5 5-5 5 5M6 12H4v9h16v-9h-2"/>',
    link: '<path d="m10 13 4-4m-6 2-3 3a4 4 0 0 0 6 6l3-3m-4-10 3-3a4 4 0 0 1 6 6l-3 3"/>',
    play: '<path d="m8 5 12 7-12 7Z"/>',
  };
  const icon = (name, className = '') => `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
  const storage = {
    read(key, fallback) { try { const raw = localStorage.getItem(`kabarin:${key}`); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
    write(key, value) { try { localStorage.setItem(`kabarin:${key}`, JSON.stringify(value)); return true; } catch { return false; } },
  };
  const rawSaved = storage.read('saved', []);
  let saved = new Set(Array.isArray(rawSaved) ? rawSaved.filter(id => /^news-[a-f0-9]{16}$/.test(id)) : []);
  let theme = storage.read('theme', 'light') === 'dark' ? 'dark' : 'light';
  const state = { hero: 0, breaking: 0, trend: 0, editor: 0, lens: 0, opinion: 0, latestCategory: 'semua', latestLimit: 6, spotlight: 'nasional', spotlightPage: 0, page: 1, sort: 'terbaru', route: '', gallery: null, photo: 0, related: 0 };
  let toastTimer;
  const cat = id => D.categories.find(category => category.id === id);
  const href = article => `#artikel/${article.id}`;
  const image = (article, className = '', eager = false) => `<img class="${className}" src="${esc(article.imageUrl || 'assets/news-placeholder.svg')}" alt="${esc(article.imageCaption || article.title)}" referrerpolicy="no-referrer" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" data-news-image>`;
  const relTime = article => article.ageMinutes < 60 ? `${article.ageMinutes} menit lalu` : article.ageMinutes < 1440 ? `${Math.floor(article.ageMinutes / 60)} jam lalu` : `${Math.floor(article.ageMinutes / 1440)} hari lalu`;
  const absoluteDate = article => new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }).format(new Date(article.date));
  const categoryLabel = article => `<a href="#kategori/${article.category}" class="category-label" style="--category-color:${cat(article.category).color}">${esc(cat(article.category).name)}</a>`;
  const avatar = article => `<span class="author-initials" aria-hidden="true">${esc(article.author.split(/\s+/).slice(0,2).map(word=>word[0]).join(''))}</span>`;
  const byline = (article, withAvatar = false) => `<div class="byline">${withAvatar ? avatar(article) : ''}<span class="author-name">${esc(article.author)}</span><span class="meta-dot"></span><span>${relTime(article)}</span><span class="meta-dot read-time-dot"></span><span class="read-time">Cuplikan sumber</span></div>`;
  const saveButton = article => `<button class="save-button ${saved.has(article.id) ? 'saved' : ''}" data-action="save" data-id="${article.id}" aria-label="${saved.has(article.id) ? 'Hapus dari tersimpan' : 'Simpan berita'}: ${esc(article.title)}" aria-pressed="${saved.has(article.id)}">${icon('bookmark')}</button>`;
  const card = (article, summary = false, badge = false) => `<article class="news-card"><a class="image-wrap" href="${href(article)}" tabindex="-1" aria-hidden="true">${image(article)}${badge ? `<span class="image-tag">${icon('sparkles')} PILIHAN EDITOR</span>` : ''}</a>${categoryLabel(article)}<h3><a href="${href(article)}">${esc(article.title)}</a></h3>${summary ? `<p class="latest-summary">${esc(article.summary)}</p>` : ''}<div class="card-bottom">${byline(article)}${saveButton(article)}</div></article>`;
  const sectionControls = (collection, index, length, size) => `<div class="section-controls"><button data-action="carousel" data-collection="${collection}" data-direction="-1" aria-label="${collection} sebelumnya" ${index <= 0 ? 'disabled' : ''}>${icon('chevron-left')}</button><button data-action="carousel" data-collection="${collection}" data-direction="1" aria-label="${collection} berikutnya" ${index + size >= length ? 'disabled' : ''}>${icon('chevron-right')}</button></div>`;
  const tags = (limit = 20) => D.topics.slice(0, limit).map(topic => `<a href="#topik/${encodeURIComponent(topic)}">${esc(topic)}</a>`).join('');
  const navigation = () => `<a href="#" class="${!location.hash || location.hash === '#' ? 'active' : ''}">Beranda</a>${D.categories.map(category => `<a href="#kategori/${category.id}" class="${location.hash.startsWith(`#kategori/${category.id}`) ? 'active' : ''}">${category.name}</a>`).join('')}<a class="nav-special" href="#koleksi/lensa">${icon('camera')} Lensa Kabarin</a>`;
  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    $('#theme-toggle').innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    $('#theme-toggle').setAttribute('aria-label', `Aktifkan mode ${theme === 'dark' ? 'terang' : 'gelap'}`);
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#14171c' : '#ed403b';
  }
  function toast(message) {
    clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('show');
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3200);
  }
  function updateSaved() {
    $('#saved-count').textContent = saved.size;
    $$('[data-action="save"]').forEach(button => {
      const active = saved.has(button.dataset.id); const article = D.get(button.dataset.id);
      button.classList.toggle('saved', active); button.setAttribute('aria-pressed', active);
      button.setAttribute('aria-label', `${active ? 'Hapus dari tersimpan' : 'Simpan berita'}: ${article.title}`);
    });
  }
  function setArticleSaved(id, desired) {
    if (!D.get(id) || typeof desired !== 'boolean') throw new Error('Artikel atau status simpan tidak valid.');
    const next = new Set(saved);
    desired ? next.add(id) : next.delete(id);
    D.persistSaved([...next]);
    saved = next;
    updateSaved();
    if (location.hash === '#tersimpan') render({ scroll: false });
    toast(desired ? 'Berita tersimpan. Temukan di ruang bacaanmu.' : 'Berita dihapus dari bacaan tersimpan.');
  }
  function breakingMarkup() {
    const article = D.collections.sorotan[state.breaking];
    return `<span class="breaking-label"><span class="pulse-dot"></span> SEKILAS KABAR</span><span class="breaking-separator"></span><a class="breaking-title" href="${href(article)}">${esc(article.title)}</a><span class="breaking-time">${esc(article.source)}</span><div class="breaking-controls"><button data-action="breaking" data-direction="-1" aria-label="Kilas berita sebelumnya">${icon('chevron-left')}</button><button data-action="breaking" data-direction="1" aria-label="Kilas berita berikutnya">${icon('chevron-right')}</button></div>`;
  }
  function heroMarkup() {
    const article = D.collections.sorotan[state.hero];
    return `<article class="hero-main">${image(article, '', true)}<span class="hero-badge">${icon('sparkles')} SOROTAN HARI INI</span><div class="hero-main-content">${categoryLabel(article)}<h1><a href="${href(article)}">${esc(article.title)}</a></h1><p class="hero-summary">${esc(article.summary)}</p>${byline(article, true)}</div></article><div class="hero-controls"><button class="hero-control" data-action="hero" data-direction="-1" aria-label="Sorotan sebelumnya">${icon('chevron-left')}</button><div class="hero-dots">${Array.from({ length: 5 }, (_, index) => `<button class="hero-dot ${index === state.hero % 5 ? 'active' : ''}" data-action="hero-jump" data-index="${Math.floor(state.hero / 5) * 5 + index}" aria-label="Sorotan ${Math.floor(state.hero / 5) * 5 + index + 1}" ${index === state.hero % 5 ? 'aria-current="true"' : ''}></button>`).join('')}</div><button class="hero-control" data-action="hero" data-direction="1" aria-label="Sorotan berikutnya">${icon('chevron-right')}</button><span class="hero-count">${String(state.hero + 1).padStart(2, '0')} / 20</span></div>`;
  }
  function sideFeature(article) { return `<article class="side-feature"><a class="image-wrap" href="${href(article)}" tabindex="-1" aria-hidden="true">${image(article)}</a>${categoryLabel(article)}<h3><a href="${href(article)}">${esc(article.title)}</a></h3>${byline(article)}</article>`; }
  function trendingMarkup() {
    return `<div class="trending-heading"><h2>${icon('flame')} Terpopuler</h2><span class="trending-period" title="Urutan berdasarkan bacaan pada browser ini; berita terbaru ditampilkan ketika belum ada hitungan.">Di perangkat ini</span></div><div class="trending-list">${D.collections.populer.slice(state.trend, state.trend + 5).map((article, index) => `<article class="trend-item"><span class="trend-number">${String(state.trend + index + 1).padStart(2, '0')}</span><div>${categoryLabel(article)}<h3><a href="${href(article)}">${esc(article.title)}</a></h3><div class="trend-meta"><span data-pagesquire-private>${article.views ? `${article.views} kali dibuka di sini` : 'Terbaru dari sumber'}</span><span class="meta-dot"></span><span>${relTime(article)}</span></div></div></article>`).join('')}</div><div class="trend-footer"><a class="section-link" href="#koleksi/populer">Lihat 20 berita ${icon('arrow-right')}</a><div class="small-pager"><button data-action="trend" data-direction="-1" aria-label="Terpopuler sebelumnya" ${state.trend === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button><button data-action="trend" data-direction="1" aria-label="Terpopuler berikutnya" ${state.trend >= 15 ? 'disabled' : ''}>${icon('chevron-right')}</button></div></div>`;
  }
  function editorMarkup() {
    return `<div class="section-heading"><div class="editor-heading-left"><h2>Pilihan Editor</h2><span class="eyebrow">LAYAK DIBACA</span></div><div class="heading-actions"><a class="section-link" href="#koleksi/editor">Lihat semua ${icon('arrow-right')}</a>${sectionControls('editor', state.editor, 20, 4)}</div></div><div class="cards-grid">${D.collections.editor.slice(state.editor, state.editor + 4).map(article => card(article)).join('')}</div><div class="section-progress"><span style="transform:translateX(${state.editor / 4 * 100}%)"></span></div>`;
  }
  function latestMarkup() {
    const list = D.articles.filter(article => state.latestCategory === 'semua' || article.category === state.latestCategory).sort((a, b) => a.ageMinutes - b.ageMinutes);
    return `<div class="section-heading"><h2>Kabar Terbaru</h2><a class="section-link" href="#semua">Lihat semua ${icon('arrow-right')}</a></div><div class="latest-tabs" role="group" aria-label="Filter kabar terbaru">${[{ id: 'semua', name: 'Semua' }, ...D.categories].map(category => `<button class="${state.latestCategory === category.id ? 'active' : ''}" data-action="latest-filter" data-category="${category.id}" aria-pressed="${state.latestCategory === category.id}">${category.name}</button>`).join('')}</div><div class="latest-list">${list.slice(0, state.latestLimit).map(article => `<article class="latest-item"><a class="image-wrap" href="${href(article)}" tabindex="-1" aria-hidden="true">${image(article)}</a><div>${categoryLabel(article)}<h3><a href="${href(article)}">${esc(article.title)}</a></h3><p class="latest-summary">${esc(article.summary)}</p><div class="card-bottom">${byline(article)}${saveButton(article)}</div></div></article>`).join('')}</div>${state.latestLimit < list.length ? `<button class="button button-outline load-more" data-action="load-more">Muat berita lainnya ${icon('chevron-down')}</button>` : ''}<p class="feed-count">Menampilkan ${Math.min(state.latestLimit, list.length)} dari ${list.length} berita</p>`;
  }
  function newsletterMarkup() {
    const subscribed = storage.read('newsletter', null);
    return `<div class="newsletter-icon">${icon('mail')}</div><span class="eyebrow">KABARIN PAGI</span><h3>Kabar baik.<br>Langsung di inbox.</h3><p>Ringkasan cerita pilihan untuk menemani awal harimu. Singkat, relevan, dan bermakna.</p>${subscribed ? `<div class="newsletter-success">${icon('check')}<strong>Kamu sudah masuk daftar!</strong><p>Alamat email tersimpan di browser ini untuk simulasi. Tidak ada email yang dikirim.</p><button data-action="unsubscribe">Gunakan alamat lain</button></div>` : `<form class="newsletter-form" id="newsletter-form"><label class="sr-only" for="newsletter-email">Alamat email</label><input id="newsletter-email" name="email" type="email" placeholder="Alamat email kamu" required maxlength="120" autocomplete="email"><label><input type="checkbox" name="consent" required><span>Saya setuju alamat email disimpan di browser ini untuk demo newsletter.</span></label><button type="submit" class="button button-red">Daftar gratis ${icon('arrow-right')}</button></form>`}<p class="newsletter-note">Newsletter demo · Tanpa spam, tanpa pengiriman email.</p>`;
  }
  function lensMarkup() {
    const size = window.innerWidth <= 420 ? 1 : window.innerWidth <= 760 ? 2 : 3;
    state.lens = Math.min(state.lens, 20 - size);
    const items = D.collections.lensa.slice(state.lens, state.lens + size);
    return `<div class="section-heading"><div><h2>Lensa Kabarin</h2><p class="section-description">Karena satu foto bisa bercerita lebih banyak.</p></div><div class="heading-actions"><a class="section-link" href="#koleksi/lensa">Jelajahi cerita foto ${icon('arrow-right')}</a>${sectionControls('lens', state.lens, 20, size)}</div></div><div class="lens-grid">${items.map(article => `<button class="lens-card" data-action="gallery" data-id="${article.id}" aria-label="Lihat cerita foto: ${esc(article.title)}">${image(article)}<span class="photo-icon">${icon('camera')}</span><div class="lens-content"><span class="category-label">${cat(article.category).name} / CERITA FOTO</span><h3>${esc(article.title)}</h3><span class="photo-meta">${icon('images')} ${article.photoCount} foto <span class="meta-dot"></span> ${esc(article.author)}</span></div></button>`).join('')}</div><div class="lens-footer"><span>${String(state.lens + 1).padStart(2, '0')}–${String(Math.min(20, state.lens + size)).padStart(2, '0')} dari 20 cerita foto</span><div class="section-progress"><span style="width:${size / 20 * 100}%;transform:translateX(${state.lens / size * 100}%)"></span></div><span>Temukan sudut pandang lain ${icon('arrow-up-right')}</span></div>`;
  }
  function spotlightMarkup() {
    const category = cat(state.spotlight);
    const list = D.articles.filter(article => article.category === category.id).slice(state.spotlightPage, state.spotlightPage + 4);
    const total = D.articles.filter(article => article.category === category.id).length;
    const lead = list[0];
    if (!lead) return `<div class="section-heading"><h2>Ragam Perspektif</h2></div><p class="feed-count">Belum ada berita ${esc(category.name)} dari sumber.</p>`;
    return `<div class="category-heading"><div class="section-heading"><h2>Ragam Perspektif</h2></div><div class="category-nav" role="group" aria-label="Pilih kategori perspektif">${D.categories.filter(category => category.id !== 'opini').map(category => `<button data-action="spotlight" data-category="${category.id}" class="${state.spotlight === category.id ? 'active' : ''}" aria-pressed="${state.spotlight === category.id}">${category.name}</button>`).join('')}</div></div><div class="category-highlight"><article class="category-lead"><a class="image-wrap" href="${href(lead)}" tabindex="-1" aria-hidden="true">${image(lead)}</a><div>${categoryLabel(lead)}<h3><a href="${href(lead)}">${esc(lead.title)}</a></h3><p class="latest-summary">${esc(lead.summary)}</p>${byline(lead)}</div></article><div class="category-small-list">${list.slice(1).map(article => `<article class="category-small"><a href="${href(article)}" class="image-wrap" tabindex="-1" aria-hidden="true">${image(article)}</a><div><h3><a href="${href(article)}">${esc(article.title)}</a></h3>${byline(article)}</div></article>`).join('')}</div></div><div class="category-bottom"><span>${state.spotlightPage + 1}–${Math.min(total,state.spotlightPage + 4)} dari ${total} cerita ${category.name}</span><div class="heading-actions"><a class="section-link" href="#kategori/${category.id}">Selengkapnya di ${category.name} ${icon('arrow-right')}</a>${sectionControls('spotlightPage', state.spotlightPage, total, 4)}</div></div>`;
  }
  function opinionMarkup() {
    return `<div class="section-heading"><div><h2>Ruang Opini</h2><p class="section-description">Gagasan yang membuka percakapan.</p></div><div class="heading-actions"><a class="section-link" href="#kategori/opini">Semua opini ${icon('arrow-right')}</a>${sectionControls('opinion', state.opinion, 20, 3)}</div></div><div class="opinion-grid">${D.collections.opini.slice(state.opinion, state.opinion + 3).map(article => `<article class="opinion-card"><div class="quote-mark">“</div><h3><a href="${href(article)}">${esc(article.title)}</a></h3><div class="opinion-author">${avatar(article)}<div><strong>${esc(article.author)}</strong><span>${esc(article.role)}</span></div>${saveButton(article)}</div></article>`).join('')}</div>`;
  }
  function home() {
    document.title = 'Kabarin — Kabar baik dimulai dari sini.';
    if (!D.mixed.length) return `<div class="container">${emptyState('info','Sumber berita belum terhubung.','Data berita belum dapat dimuat. Periksa koneksi dan coba kembali; bacaan tersimpan tetap dapat dibuka melalui menu Tersimpan.')}<button class="button button-red news-retry" data-action="retry-news">Coba muat ulang</button></div>`;
    return `<div class="container"><div id="breaking-bar" class="breaking-bar" aria-label="Kilas berita">${breakingMarkup()}</div><section class="headline-section" aria-labelledby="headline-title"><div class="section-heading headline-heading"><h2 id="headline-title">Cerita Hari Ini</h2><span class="heading-context"><span class="live-dot"></span> Selalu ada cerita untukmu.</span></div><div class="headline-layout"><div class="hero-grid"><div id="hero-carousel">${heroMarkup()}</div><div class="hero-sides">${sideFeature(D.mixed.find(item=>item.category==='teknologi')||D.mixed[0])}${sideFeature(D.mixed.find(item=>item.category==='olahraga')||D.mixed[1]||D.mixed[0])}</div></div><aside class="trending-box" id="trending-box" aria-label="20 berita terpopuler">${trendingMarkup()}</aside></div></section><div class="topic-strip"><span class="topic-strip-label">${icon('flame')} Lagi dibicarakan</span><div class="topic-tags" id="topic-scroll">${tags()}</div><button class="topic-more" data-action="topics-next" aria-label="Lihat topik lainnya">${icon('arrow-right')}</button></div><section class="content-section editor-section" id="editor-section" aria-label="20 pilihan editor">${editorMarkup()}</section><section class="content-section feed-layout"><div id="latest-section" aria-label="Kabar terbaru">${latestMarkup()}</div><aside><div class="sidebar-newsletter" id="newsletter">${newsletterMarkup()}</div><div class="sidebar-topic"><h3>Temukan topikmu</h3><div class="topic-tags">${tags()}</div></div><div class="sidebar-note">${icon('info')}<div><strong>Cerita yang kamu baca, berarti.</strong><p>Simpan bacaan favorit dan lanjutkan kapan saja, di perangkat ini.</p></div></div></aside></section></div><section class="lens-section" aria-label="20 cerita foto"><div class="container" id="lens-section">${lensMarkup()}</div></section><div class="container"><section class="content-section category-section" id="spotlight-section">${spotlightMarkup()}</section><section class="opinion-section" id="opinion-section" aria-label="20 opini pilihan">${opinionMarkup()}</section><div class="bottom-newsletter"><div class="newsletter-icon">${icon('mail')}</div><div><h2>Dunia terus bergerak. Tetap terhubung.</h2><p>Cerita pilihan, perspektif baru, dan inspirasi untuk keseharianmu.</p></div><a class="button button-red" href="#newsletter">Mulai pagi bersama Kabarin ${icon('arrow-right')}</a></div></div>`;
  }
  const collectionMeta = {
    sorotan: ['Sorotan Hari Ini', 'Cerita utama yang membentuk percakapan hari ini.'],
    editor: ['Pilihan Editor', 'Pilihan otomatis lintas kategori dari feed sumber, dengan atribusi penerbit.'],
    populer: ['Berita Terpopuler', 'Urutan berdasarkan bacaan pada browser ini. Berita terbaru ditampilkan saat belum ada hitungan.'],
    lensa: ['Lensa Kabarin', '20 cerita foto. Berhenti sejenak dan lihat dunia dari sudut yang berbeda.'],
  };
  function normalize(value) { return value.toLocaleLowerCase('id-ID').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function searchArticles(query) {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return D.articles.filter(article => words.every(word => normalize([article.title, article.summary, article.author, article.topic, cat(article.category).name].join(' ')).includes(word)));
  }
  function browse(type, value) {
    let title, description, items, kicker = 'JELAJAHI KABARIN';
    if (type === 'kategori') {
      const category = cat(value); if (!category) return notFound();
      title = category.name; description = category.description; items = D.articles.filter(article => article.category === value); kicker = 'RUANG CERITA';
    } else if (type === 'koleksi') {
      if (!collectionMeta[value]) return notFound();
      [title, description] = collectionMeta[value]; items = [...D.collections[value]]; kicker = 'KURASI KABARIN';
    } else if (type === 'cari' || type === 'topik') {
      title = type === 'topik' ? `#${value}` : 'Temukan ceritamu.';
      description = type === 'topik' ? `Cerita, gagasan, dan perspektif seputar ${value}.` : `Hasil pencarian untuk “${value}”.`;
      items = type === 'topik' ? D.articles.filter(article => article.tags.includes(value)) : searchArticles(value); kicker = type === 'topik' ? 'TOPIK PILIHAN' : 'PENCARIAN';
    } else if (type === 'tersimpan') {
      title = 'Ruang bacaanmu.'; description = 'Cerita yang ingin kamu simpan. Siap dibaca kapan saja, di browser ini.'; items = D.articles.filter(article => saved.has(article.id)); kicker = 'KOLEKSI PERSONAL';
    } else { title = 'Semua Cerita'; description = 'Selalu ada cerita baru yang menunggu untuk kamu temukan.'; items = [...D.articles]; }
    const categoryCounts = D.categories.map(category => ({ ...category, count: items.filter(article => article.category === category.id).length }));
    if (type === 'cari' && state.latestCategory !== 'semua') items = items.filter(article => article.category === state.latestCategory);
    if (state.sort === 'populer') items.sort((a, b) => b.views - a.views);
    else if (state.sort === 'terlama') items.sort((a, b) => b.ageMinutes - a.ageMinutes);
    else if (!(type === 'koleksi' && state.sort === 'terbaru')) items.sort((a, b) => a.ageMinutes - b.ageMinutes);
    const perPage = 12;
    const pageCount = Math.ceil(items.length / perPage);
    state.page = Math.max(1, Math.min(state.page, pageCount || 1));
    document.title = `${title} — Kabarin`;
    return `<div class="container browse-section"><div class="page-header"><div class="breadcrumb"><a href="#">Beranda</a>${icon('chevron-right')}<span>${type === 'cari' ? 'Pencarian' : esc(title)}</span></div><div class="eyebrow">${kicker}</div><h1>${esc(title)}</h1><p>${esc(description)}</p>${type === 'cari' ? `<form class="search-inline" id="inline-search-form"><label class="sr-only" for="inline-query">Kata kunci pencarian</label><input type="search" id="inline-query" name="query" value="${esc(value)}" placeholder="Cari berita, topik, atau penulis" maxlength="120" required><button class="button button-red" type="submit">${icon('search')} Cari</button></form>` : ''}</div>${type === 'cari' ? `<div class="latest-tabs"><button data-action="search-filter" data-category="semua" class="${state.latestCategory === 'semua' ? 'active' : ''}">Semua</button>${categoryCounts.filter(category => category.count).map(category => `<button data-action="search-filter" data-category="${category.id}" class="${state.latestCategory === category.id ? 'active' : ''}">${category.name} (${category.count})</button>`).join('')}</div>` : ''}<div class="browse-toolbar"><span><strong>${items.length}</strong> ${type === 'koleksi' && value === 'lensa' ? 'cerita foto' : 'berita'}${items.length ? ` · Menampilkan ${(state.page - 1) * perPage + 1}–${Math.min(state.page * perPage, items.length)}` : ''}</span><div class="browse-sort"><label for="sort-select">Urutkan:</label><select id="sort-select" aria-label="Urutkan berita"><option value="terbaru" ${state.sort === 'terbaru' ? 'selected' : ''}>${type === 'koleksi' ? 'Pilihan redaksi' : 'Terbaru'}</option><option value="populer" ${state.sort === 'populer' ? 'selected' : ''}>Paling dibaca</option><option value="terlama" ${state.sort === 'terlama' ? 'selected' : ''}>Terlama</option></select></div></div>${items.length ? `<div class="browse-grid">${items.slice((state.page - 1) * perPage, state.page * perPage).map(article => type === 'koleksi' && value === 'lensa' ? `<article class="news-card"><button class="image-wrap" style="width:100%" data-action="gallery" data-id="${article.id}" aria-label="Lihat cerita foto: ${esc(article.title)}">${image(article)}<span class="image-tag">${icon('camera')} ${article.photoCount} FOTO</span></button>${categoryLabel(article)}<h3><button style="text-align:left" data-action="gallery" data-id="${article.id}">${esc(article.title)}</button></h3><div class="card-bottom">${byline(article)}${saveButton(article)}</div></article>` : card(article, true)).join('')}</div>${pagination(pageCount)}` : emptyState(type === 'tersimpan' ? 'bookmark' : 'search', type === 'tersimpan' ? 'Bacaan favoritmu dimulai di sini.' : 'Belum menemukan cerita yang cocok.', type === 'tersimpan' ? 'Ketuk ikon simpan pada berita yang menarik perhatianmu. Bacaanmu akan muncul di halaman ini.' : 'Coba kata kunci yang lebih singkat, seperti “kota”, “musik”, “teknologi”, atau nama penulis.')}</div>`;
  }
  function pagination(count) {
    if (count <= 1) return '';
    const pages = count <= 7 ? Array.from({ length: count }, (_, index) => index + 1) : [...new Set([1, ...Array.from({ length: 5 }, (_, index) => Math.max(2, Math.min(count - 5, state.page - 2)) + index), count])];
    return `<nav class="pagination" aria-label="Halaman berita"><button data-action="page" data-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''} aria-label="Halaman sebelumnya">${icon('chevron-left')}</button>${pages.map((page, index) => `${index && page > pages[index - 1] + 1 ? '<span>…</span>' : ''}<button class="${page === state.page ? 'active' : ''}" data-action="page" data-page="${page}" aria-label="Halaman ${page}" ${page === state.page ? 'aria-current="page"' : ''}>${page}</button>`).join('')}<button data-action="page" data-page="${state.page + 1}" ${state.page === count ? 'disabled' : ''} aria-label="Halaman berikutnya">${icon('chevron-right')}</button></nav>`;
  }
  function emptyState(symbol, title, description) { return `<div class="empty-state"><div class="empty-icon">${icon(symbol)}</div><h2>${esc(title)}</h2><p>${esc(description)}</p><a class="button button-red" href="#">Jelajahi cerita hari ini ${icon('arrow-right')}</a></div>`; }
  function notFound() {
    document.title = 'Cerita belum ditemukan — Kabarin';
    return `<div class="container">${emptyState('search', 'Sepertinya kita kehilangan jejak.', 'Halaman atau artikel yang kamu cari belum tersedia. Masih ada banyak cerita lain untuk dijelajahi.')}</div>`;
  }
  function articleContent(article) {
    return `<h2>Cuplikan dari ${esc(article.source)}</h2><p>${esc(article.content || article.summary || 'Sumber tidak menyediakan teks cuplikan untuk berita ini.')}</p><div class="source-read-more"><p>Feed sumber menyediakan cuplikan, bukan naskah artikel lengkap. Kabarin tidak menambahkan isi atau kutipan yang tidak tersedia.</p><a class="button button-red" href="${esc(article.sourceUrl)}" target="_blank" rel="noopener noreferrer">Baca berita lengkap di sumber ${icon('arrow-up-right')}</a></div>`;
  }
  function relatedMarkup(article) {
    const related = [...D.articles.filter(item => item.category === article.category && item.id !== article.id), ...D.collections.editor.filter(item => item.category !== article.category && item.id !== article.id)].slice(0, 20);
    const size = window.innerWidth <= 760 ? 2 : 4;
    state.related = Math.min(state.related, 20 - size);
    return `<div class="section-heading"><h2>Cerita Terkait</h2><div class="heading-actions"><a class="section-link" href="#kategori/${article.category}">Lihat semua ${icon('arrow-right')}</a>${sectionControls('related', state.related, related.length, size)}</div></div><div class="cards-grid">${related.slice(state.related, state.related + size).map(item => card(item)).join('')}</div><p class="feed-count">${state.related + 1}–${Math.min(state.related + size, 20)} dari 20 cerita terkait</p>`;
  }
  function articleView(id) {
    const article = D.get(id); if (!article) return notFound();
    document.title = `${article.title} — Kabarin`;
    return `<div class="reading-progress" aria-hidden="true"><span id="reading-progress"></span></div><div class="container article-view"><div class="breadcrumb"><a href="#">Beranda</a>${icon('chevron-right')}<a href="#kategori/${article.category}">${cat(article.category).name}</a>${icon('chevron-right')}<span>Detail cerita</span></div><div class="article-layout"><article class="article-main" data-content-coverage="excerpt">${categoryLabel(article)}<h1>${esc(article.title)}</h1><p class="article-deck">${esc(article.summary)}</p><div class="article-author-row">${avatar(article)}<div><strong>${esc(article.author)}</strong><p>${absoluteDate(article)} · Cuplikan sumber</p></div><div class="article-tools">${saveButton(article)}<button data-action="share" data-id="${article.id}" aria-label="Salin tautan artikel">${icon('share')}</button><button data-action="font-size" aria-label="Ubah ukuran teks bacaan">A<span style="font-size:10px">A</span></button></div></div>${image(article, 'article-cover', true)}<p class="image-caption">${esc(article.imageCaption)}</p><div class="article-demo-note"><strong>Dari ${esc(article.source)}:</strong> Judul, tanggal, foto dan cuplikan mengikuti feed penerbit. Tautan naskah lengkap tersedia di bawah.</div><div class="article-body" id="article-body">${articleContent(article)}</div><div class="article-end">${article.authorProvided ? 'Penulis: '+esc(article.author)+' · ' : ''}Sumber: <a href="${esc(article.sourceUrl)}" target="_blank" rel="noopener noreferrer">${esc(article.source)}</a><br>Hak cipta teks dan foto mengikuti penerbit. Kabarin merupakan agregator berita.</div><div class="topic-tags article-tags">${article.tags.map(tag => `<a href="#topik/${encodeURIComponent(tag)}">${esc(tag)}</a>`).join('')}</div></article><aside class="article-aside"><h2>Baca Juga</h2>${D.collections.editor.filter(item => item.id !== article.id).slice(0, 3).map(item => card(item)).join('')}<div class="sidebar-note">${icon('bookmark')}<div><strong>Lanjutkan kapan saja.</strong><p>Simpan cerita yang menarik untuk dibaca kembali di browser ini.</p></div></div></aside></div><section id="related-section" class="article-related">${relatedMarkup(article)}</section></div>`;
  }
  async function render(options = {}) {
    const raw = location.hash.replace(/^#\/?/, '');
    const [type, ...parts] = raw.split('/');
    let value;
    try { value = decodeURIComponent(parts.join('/')); } catch { value = ''; }
    if (type === 'artikel' && !D.get(value)) { await D.ensure(value); if (location.hash.replace(/^#\/?/, '') !== raw) return; }
    const isNewRoute = raw !== state.route;
    if (isNewRoute) { state.page = 1; state.sort = 'terbaru'; state.related = 0; if (type !== 'newsletter') state.latestCategory = 'semua'; }
    state.route = raw;
    if (isNewRoute && type === 'artikel') D.recordView(value);
    $$('dialog[open]').forEach(dialog => dialog.close());
    $('.mobile-menu-trigger').setAttribute('aria-expanded', 'false');
    $('#main-content').innerHTML = !raw || type === 'newsletter' ? home() : type === 'artikel' ? articleView(value) : ['kategori', 'koleksi', 'cari', 'topik', 'tersimpan', 'semua'].includes(type) ? browse(type, value) : notFound();
    $('#main-content').dataset.route = raw;
    $('#newsletter')?.setAttribute('data-pagesquire-private', '');
    $('#main-nav').innerHTML = navigation();
    updateSaved();
    if (options.scroll !== false) {
      if (type === 'newsletter') requestAnimationFrame(() => { $('#newsletter').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
      else window.scrollTo({ top: 0, behavior: 'instant' });
    }
    if (isNewRoute && type && type !== 'newsletter') $('#main-content').focus({ preventScroll: true });
  }
  const infoText = {
    'Tentang Kabarin': ['Cerita yang berarti.', 'Kabarin adalah konsep portal berita Indonesia yang mengutamakan pengalaman membaca yang jernih, nyaman, dan dekat dengan pembaca.', 'Berita diambil dari feed publik ANTARA News, CNN Indonesia, dan CNBC Indonesia. Kabarin menampilkan cuplikan dengan tautan dan atribusi penerbit; tidak menulis ulang naskah berita lengkap.'],
    Redaksi: ['Di balik setiap cerita.', 'Kabarin mengelompokkan cuplikan secara otomatis dari feed ANTARA News, CNN Indonesia, dan CNBC Indonesia. Nama penulis hanya dicantumkan jika disediakan sumber; jika tidak, ditampilkan nama penerbit.', 'Kabarin bukan redaksi penerbit sumber. Koreksi, hak jawab, dan naskah lengkap dapat ditelusuri melalui tautan penerbit pada setiap berita.'],
    'Pedoman media siber': ['Membaca dengan konteks.', 'Judul, tanggal, cuplikan dan foto mengikuti feed penerbit. Pemilihan kategori dan koleksi adalah pengelompokan agregator, bukan klaim peliputan Kabarin.', 'AI hanya merangkum cuplikan yang tersedia. Periksa naskah lengkap di sumber sebelum menarik kesimpulan; data tersimpan dapat ditampilkan saat sumber sementara tidak dapat dihubungi.'],
    'Hubungi kami': ['Mari mulai percakapan.', 'Formulir kontak dan akun media sosial belum dihubungkan. Tidak ada pesan atau email yang dikirim dari halaman ini.', 'Kamu bisa menjelajahi berita dari berbagai kategori, membuka sumber asli, dan menyimpan bacaan tanpa membuat akun.'],
    'Kebijakan privasi': ['Kamu memahami ke mana data pergi.', 'Preferensi tema, ID dan salinan cuplikan bacaan tersimpan, hitungan buka artikel lokal, dan alamat email newsletter demo disimpan di browser. Newsletter tidak mengirim email. Judul, cuplikan, tanggal dan foto berasal dari feed penerbit; pemuatan foto menghubungi server gambar penerbit tanpa referrer. Saat AI digunakan, pesan serta konteks publik halaman dan cakupan cuplikan diproses server Kabarin dan SumoPod.', 'Riwayat chat tidak disimpan di localStorage. Sesi chat memakai penyimpanan server terbatas (Redis pada hosting Vercel); Percakapan baru menghapus riwayat sesi tanpa mereset batas penggunaan. Form newsletter dan UI chat dikecualikan dari pengamatan. Suara hanya memakai voice Indonesia lokal jika diaktifkan, tanpa mikrofon atau TTS cloud. Membersihkan storage browser menghapus salinan bacaanmu. Tidak ada analytics atau hitungan pembaca global.'],
  };
  function showInfo(name) {
    const text = infoText[name] || [`Kabarin di ${name}`, `Kanal ${name} pada portal ini merupakan bagian dari demonstrasi desain. Akun media sosial belum dihubungkan.`, 'Jelajahi cerita pilihan dan simpan bacaan favorit langsung di website ini.'];
    $('#info-content').innerHTML = `<div class="eyebrow">RUANG KABARIN</div><h2>${esc(text[0])}</h2><p>${esc(text[1])}</p><p>${esc(text[2])}</p><button class="button button-outline" data-action="close-dialog">Mengerti ${icon('check')}</button>`;
    $('#info-dialog').showModal();
  }
  function openGallery(id) {
    state.gallery = D.get(id); state.photo = 0;
    if (!state.gallery) return;
    galleryMarkup(); $('#gallery-dialog').showModal();
  }
  function galleryMarkup() {
    const article = state.gallery;
    const photos = article.photos?.length ? article.photos : [{url:'assets/news-placeholder.svg',caption:'Sumber tidak menyediakan foto.',credit:article.source}];
    state.photo = Math.max(0,Math.min(photos.length-1,state.photo));
    const photo = photos[state.photo];
    $('#gallery-content').innerHTML = `<div class="gallery-header"><div><div class="eyebrow">LENSA KABARIN / ${esc(article.source)}</div><h2>${esc(article.title)}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Tutup galeri">${icon('x')}</button></div><div class="gallery-stage"><img src="${esc(photo.url)}" referrerpolicy="no-referrer" data-news-image alt="${esc(photo.caption)}"><button class="gallery-prev" data-action="photo" data-direction="-1" aria-label="Foto sebelumnya" ${state.photo === 0 ? 'disabled' : ''}>${icon('chevron-left')}</button><button class="gallery-next" data-action="photo" data-direction="1" aria-label="Foto berikutnya" ${state.photo === photos.length-1 ? 'disabled' : ''}>${icon('chevron-right')}</button></div><div class="gallery-caption"><p>${esc(photo.caption)} · ${esc(photo.credit)} <a href="${esc(article.sourceUrl)}" target="_blank" rel="noopener noreferrer">Lihat sumber</a></p><span>${state.photo + 1} / ${photos.length} FOTO</span></div><div class="gallery-thumbs">${photos.map((item,index) => `<button class="${index === state.photo ? 'active' : ''}" data-action="photo-jump" data-index="${index}" aria-label="Lihat foto ${index + 1}" aria-pressed="${index === state.photo}"><img src="${esc(item.url)}" referrerpolicy="no-referrer" alt="" data-news-image></button>`).join('')}</div>`;
  }
  document.addEventListener('click', async event => {
    if (event.target.closest('.skip-link')) { event.preventDefault(); $('#main-content').focus(); $('#main-content').scrollIntoView(); return; }
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const { action, direction, id, collection, index } = actionButton.dataset;
    switch (action) {
      case 'retry-news': location.reload(); break;
      case 'search': $$('dialog[open]').forEach(dialog => dialog.close()); $('#search-dialog').showModal(); $('#search-input').focus(); break;
      case 'menu': $('#menu-dialog').showModal(); $('.mobile-menu-trigger').setAttribute('aria-expanded', 'true'); break;
      case 'close-dialog': actionButton.closest('dialog').close(); break;
      case 'save': {
        try { setArticleSaved(id, !saved.has(id)); } catch (error) { toast(error.message); }
        break;
      }
      case 'hero': state.hero = (state.hero + Number(direction) + 20) % 20; $('#hero-carousel').innerHTML = heroMarkup(); break;
      case 'hero-jump': state.hero = Number(index); $('#hero-carousel').innerHTML = heroMarkup(); break;
      case 'breaking': state.breaking = (state.breaking + Number(direction) + 20) % 20; $('#breaking-bar').innerHTML = breakingMarkup(); break;
      case 'trend': state.trend = Math.max(0, Math.min(15, state.trend + Number(direction) * 5)); $('#trending-box').innerHTML = trendingMarkup(); break;
      case 'carousel': {
        const config = { editor: [4, 20, '#editor-section', editorMarkup], lens: [window.innerWidth <= 420 ? 1 : window.innerWidth <= 760 ? 2 : 3, 20, '#lens-section', lensMarkup], opinion: [3, 20, '#opinion-section', opinionMarkup], spotlightPage: [4, D.articles.filter(article=>article.category===state.spotlight).length, '#spotlight-section', spotlightMarkup], related: [window.innerWidth <= 760 ? 2 : 4, 20, '#related-section', () => relatedMarkup(D.get(location.hash.split('/')[1]))] }[collection];
        if (config) { state[collection] = Math.max(0, Math.min(config[1] - config[0], state[collection] + Number(direction) * config[0])); $(config[2]).innerHTML = config[3](); }
        break;
      }
      case 'latest-filter': state.latestCategory = actionButton.dataset.category; state.latestLimit = 6; $('#latest-section').innerHTML = latestMarkup(); break;
      case 'load-more': state.latestLimit += 6; $('#latest-section').innerHTML = latestMarkup(); break;
      case 'spotlight': state.spotlight = actionButton.dataset.category; state.spotlightPage = 0; $('#spotlight-section').innerHTML = spotlightMarkup(); break;
      case 'topics-next': $('#topic-scroll').scrollBy({ left: 280, behavior: 'smooth' }); break;
      case 'search-filter': state.latestCategory = actionButton.dataset.category; state.page = 1; render({ scroll: false }); break;
      case 'page': state.page = Number(actionButton.dataset.page); render(); break;
      case 'unsubscribe': storage.write('newsletter', null); $('#newsletter').innerHTML = newsletterMarkup(); toast('Daftar newsletter demo direset di browser ini.'); break;
      case 'info': showInfo(actionButton.dataset.info); break;
      case 'top': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'gallery': openGallery(id); break;
      case 'photo': state.photo = Math.max(0, Math.min((state.gallery?.photos.length || 1)-1, state.photo + Number(direction))); galleryMarkup(); break;
      case 'photo-jump': state.photo = Number(index); galleryMarkup(); break;
      case 'font-size': {
        const body = $('#article-body'); const enlarged = body.dataset.enlarged === 'true';
        body.style.fontSize = enlarged ? '' : '21px'; body.dataset.enlarged = String(!enlarged); toast(enlarged ? 'Ukuran teks standar.' : 'Ukuran teks diperbesar.'); break;
      }
      case 'share': {
        const url = `${location.href.split('#')[0]}#artikel/${id}`;
        try { await navigator.clipboard.writeText(url); toast('Tautan cerita disalin. Siap dibagikan.'); }
        catch { $('#info-content').innerHTML = `<div class="eyebrow">BAGIKAN CERITA</div><h2>Tautan ceritamu.</h2><p>Pilih dan salin tautan ini:</p><input style="width:100%;margin-top:15px;padding:12px;border:1px solid var(--border);border-radius:5px" readonly aria-label="Tautan artikel" value="${esc(url)}">`; $('#info-dialog').showModal(); }
        break;
      }
    }
  });
  document.addEventListener('submit', event => {
    if (['search-form', 'inline-search-form'].includes(event.target.id)) {
      event.preventDefault(); const query = new FormData(event.target).get('query').trim();
      if (!query) return;
      const newHash = `#cari/${encodeURIComponent(query)}`;
      if (location.hash === newHash) render(); else location.hash = newHash;
    } else if (event.target.id === 'newsletter-form') {
      event.preventDefault(); const data = new FormData(event.target);
      if (!data.get('consent')) return;
      if (storage.write('newsletter', { email: data.get('email'), date: new Date().toISOString() })) { $('#newsletter').innerHTML = newsletterMarkup(); toast('Berhasil! Pendaftaran demo tersimpan di browser ini.'); }
      else toast('Penyimpanan browser tidak tersedia. Data belum tersimpan.');
    }
  });
  document.addEventListener('change', event => { if (event.target.id === 'sort-select') { state.sort = event.target.value; state.page = 1; render({ scroll: false }); } });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $$('dialog[open]').forEach(dialog => dialog.close()); $('#search-dialog').showModal(); $('#search-input').focus(); }
    if ($('#gallery-dialog').open && ['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); state.photo = Math.max(0, Math.min(4, state.photo + (event.key === 'ArrowLeft' ? -1 : 1))); galleryMarkup(); }
  });
  $$('dialog').forEach(dialog => {
    dialog.addEventListener('click', event => { if (event.target === dialog) { const rect = dialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close(); } });
    dialog.addEventListener('close', () => $('.mobile-menu-trigger').setAttribute('aria-expanded', 'false'));
    dialog.addEventListener('click', event => { if (event.target.closest('a[href^="#"]')) dialog.close(); });
  });
  $('#theme-toggle').addEventListener('click', () => { theme = theme === 'light' ? 'dark' : 'light'; storage.write('theme', theme); applyTheme(); });
  window.addEventListener('hashchange', () => render());
  let responsiveGroup = window.innerWidth <= 420 ? 1 : window.innerWidth <= 760 ? 2 : 3;
  window.addEventListener('resize', () => {
    const group = window.innerWidth <= 420 ? 1 : window.innerWidth <= 760 ? 2 : 3;
    if (group === responsiveGroup) return;
    responsiveGroup = group;
    if ($('#lens-section')) $('#lens-section').innerHTML = lensMarkup();
    if ($('#related-section')) $('#related-section').innerHTML = relatedMarkup(D.get(location.hash.split('/')[1]));
  });
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (!scrollPending) requestAnimationFrame(() => {
      const progress = $('#reading-progress');
      if (progress) { const body = $('#article-body'); const total = body.offsetTop + body.offsetHeight - window.innerHeight; progress.style.width = `${Math.max(0, Math.min(100, window.scrollY / Math.max(1, total) * 100))}%`; }
      scrollPending = false;
    });
    scrollPending = true;
  }, { passive: true });
  $$('[data-icon]').forEach(element => { element.innerHTML = icon(element.dataset.icon); });
  $('#footer-categories').innerHTML = D.categories.map(category => `<a href="#kategori/${category.id}">${category.name}</a>`).join('');
  $('#mobile-nav').innerHTML = `<a href="#">Beranda ${icon('arrow-up-right')}</a>${D.categories.map(category => `<a href="#kategori/${category.id}">${category.name} ${icon('chevron-right')}</a>`).join('')}<a href="#koleksi/lensa">Lensa Kabarin ${icon('camera')}</a>`;
  $('#search-topics').innerHTML = tags();
  // Owner-defined integration surface. PageSquire receives no generic click/eval access.
  const navigatePortal = route => {
    if (location.hash === `#${route}` || (!location.hash && !route)) render();
    else location.hash = route;
    return route;
  };
  const sectionIds = { headline: 'headline-title', editor: 'editor-section', latest: 'latest-section', newsletter: 'newsletter', lens: 'lens-section', perspectives: 'spotlight-section', opinion: 'opinion-section' };
  window.KabarinPortal = Object.freeze({
    home: () => navigatePortal(''),
    search: query => { if (typeof query !== 'string' || !query.trim() || query.length > 120) throw new Error('Kata kunci tidak valid.'); return navigatePortal(`cari/${encodeURIComponent(query.trim())}`); },
    category: id => { if (!cat(id)) throw new Error('Kategori tidak ditemukan.'); return navigatePortal(`kategori/${id}`); },
    article: id => { if (!D.get(id)) throw new Error('Artikel tidak ditemukan.'); return navigatePortal(`artikel/${id}`); },
    collection: id => { if (!collectionMeta[id]) throw new Error('Koleksi tidak ditemukan.'); return navigatePortal(`koleksi/${id}`); },
    showSaved: () => navigatePortal('tersimpan'),
    bookmark: setArticleSaved,
    isSaved: id => saved.has(id),
    theme: value => { if (!['light', 'dark'].includes(value)) throw new Error('Tema tidak valid.'); theme = value; storage.write('theme', theme); applyTheme(); },
    readingSize: size => { const body = $('#article-body'); if (!body) throw new Error('Buka sebuah artikel terlebih dahulu.'); if (!['standard', 'large'].includes(size)) throw new Error('Ukuran tidak valid.'); body.style.fontSize = size === 'large' ? '21px' : ''; body.dataset.enlarged = String(size === 'large'); },
    section: key => { const element = document.getElementById(sectionIds[key]); if (!element) throw new Error('Bagian halaman belum tersedia.'); element.scrollIntoView({ behavior: 'instant', block: 'start' }); return element.id; },
    sectionId: key => sectionIds[key],
  });
  document.addEventListener('error', event => {
    const image = event.target;
    if (image.matches?.('img[data-news-image]') && !image.src.endsWith('/assets/news-placeholder.svg')) { image.src='assets/news-placeholder.svg'; image.alt='Gambar sumber tidak dapat dimuat.'; }
  }, true);
  $('#today-date').textContent = new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Jakarta'}).format(new Date());
  function updateNewsStatus(){const status=$('.demo-label');status.textContent=D.unavailable?'SUMBER OFFLINE':D.meta.stale?'DATA TERSIMPAN':'BERITA TERKINI';status.title=D.meta.updatedAt?`Sinkron terakhir ${new Date(D.meta.updatedAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta'})}. Sumber: ${(D.meta.publishers??[]).join(', ')}. Tanggal terbit mengikuti penerbit.`:'Sumber berita belum tersedia.';}
  window.addEventListener('kabarin:news-updated',()=>{
    updateNewsStatus();
    // Keep an active reading, assistant action, dialog or form intact. Updated
    // data remains available for the next navigation even when rendering is deferred.
    if(document.querySelector('.article-main,dialog[open],#k-ai-log[aria-busy="true"],[data-driving="true"]')||window.scrollY>0||$('#main-content').contains(document.activeElement)&&document.activeElement?.matches('input,textarea,select'))return;
    void render({scroll:false});
  });
  updateNewsStatus();
  applyTheme(); await render();
})();
