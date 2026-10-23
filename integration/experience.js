import { BrowserRuntime, BrowserDriver, CapabilityRegistry, PageObserver, AppContext, createPageBindings } from '@pagesquire/core';
import { GuidedTour, SpeechOutput } from '@pagesquire/client';

/** Owner-authored targets and state; model output never supplies a selector. */
export function createPortalExperience(portal, manifest, parameters) {
  const observer = new PageObserver({ document, canInteract: () => false, allowUrl: url => url.pathname === location.pathname && !url.search, maxTextLength: 14000, maxTargets: 100 });
  const driver = new BrowserDriver({ observer, durationMs: 420 });
  const visible = selector => [...document.querySelectorAll(selector)].find(element => !observer.isExcluded(element) && observer.isVisible(element));
  const present = async (target, context, kind = 'click') => { if (target) await context.present(target, kind); context.signal.throwIfAborted(); };
  const routeVerified = route => ({ verified: document.querySelector('main')?.dataset.route === route, evidence: { route, title: document.title } });
  const routeLink = route => [...document.querySelectorAll('a[href]')].find(link => link.hash === `#${route}` && !observer.isExcluded(link) && observer.isVisible(link));
  async function go(route, navigate, context) {
    await present(routeLink(route), context);
    context.signal.throwIfAborted();
    navigate();
    await context.waitFor(() => document.querySelector('main')?.dataset.route === route);
    await present(visible('main h1'), context, 'highlight');
  }
  const sectionElement = section => document.getElementById(portal.sectionId(section));
  const handlers = {
    search: (p, c) => go(`cari/${encodeURIComponent(p.query.trim())}`, () => portal.search(p.query), c),
    category: (p, c) => go(`kategori/${p.category}`, () => portal.category(p.category), c),
    article: async (p, c) => { await window.KABARIN.ensure(p.articleId,c.signal); c.signal.throwIfAborted(); await go(`artikel/${p.articleId}`, () => portal.article(p.articleId), c); },
    collection: (p, c) => go(`koleksi/${p.collection}`, () => portal.collection(p.collection), c),
    home: (p, c) => go('', () => portal.home(), c),
    saved: (p, c) => go('tersimpan', () => portal.showSaved(), c),
    bookmark: async (p, c) => { if (portal.isSaved(p.articleId) === p.saved) return; await present(visible(`[data-action="save"][data-id="${p.articleId}"]`), c); portal.bookmark(p.articleId, p.saved); },
    theme: async (p, c) => { if (document.documentElement.dataset.theme === p.theme) return; await present(visible('#theme-toggle'), c); portal.theme(p.theme); },
    readingSize: async (p, c) => { await present(visible('[data-action="font-size"]'), c); portal.readingSize(p.size); },
    section: async (p, c) => {
      if (!sectionElement(p.section)) await go('', () => portal.home(), c);
      c.signal.throwIfAborted();
      const target = sectionElement(p.section);
      if (observer.isExcluded(target)) portal.section(p.section);
      else await driver.scrollTo(target, c.signal, 'start');
    },
  };
  const verifiers = {
    verifySearch: p => routeVerified(`cari/${encodeURIComponent(p.query.trim())}`),
    verifyCategory: p => routeVerified(`kategori/${p.category}`),
    verifyArticle: p => routeVerified(`artikel/${p.articleId}`),
    verifyCollection: p => routeVerified(`koleksi/${p.collection}`),
    verifyHome: () => routeVerified(''),
    verifySaved: () => routeVerified('tersimpan'),
    verifyBookmark: p => ({ verified: portal.isSaved(p.articleId) === p.saved, evidence: { articleId: p.articleId, saved: portal.isSaved(p.articleId) } }),
    verifyTheme: p => ({ verified: document.documentElement.dataset.theme === p.theme, evidence: { theme: document.documentElement.dataset.theme } }),
    verifyReadingSize: p => ({ verified: !!document.querySelector('#article-body') && (document.querySelector('#article-body').dataset.enlarged === 'true') === (p.size === 'large'), evidence: { size: p.size } }),
    verifySection: p => { const rect = sectionElement(p.section)?.getBoundingClientRect(); return { verified: !!rect && rect.bottom > 0 && rect.top < innerHeight, evidence: { section: p.section } }; },
  };
  const pages = createPageBindings({ scopes: { article: c => c.observer.findUnique('main .article-main'), page: c => c.observer.findUnique('main') }, driver });
  const registry = new CapabilityRegistry(manifest, { handlers: { ...handlers, ...pages.handlers }, verifiers: { ...verifiers, ...pages.verifiers }, parameters });
  const articleId = () => /^#artikel\/([a-z0-9-]{1,70})$/.exec(location.hash)?.[1] ?? 'none';
  const view = () => {
    const type = location.hash.replace(/^#/, '').split('/')[0];
    return ({ '': 'home', artikel: 'article', kategori: 'category', koleksi: 'collection', cari: 'search', tersimpan: 'saved' })[type] ?? 'other';
  };
  const appContext = new AppContext({ registry, fields: {
    view: { public: true, type: 'enum', values: ['home', 'article', 'category', 'collection', 'search', 'saved', 'other'], read: view },
    article_id: { public: true, type: 'string', maxLength: 70, read: articleId },
    theme: { public: true, type: 'enum', values: ['light', 'dark'], read: () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light' },
    reading_size: { public: true, type: 'enum', values: ['standard', 'large'], read: () => document.querySelector('#article-body')?.dataset.enlarged === 'true' ? 'large' : 'standard' },
    content_coverage: { public: true, type: 'enum', values: ['excerpt', 'listing'], read: () => articleId() === 'none' ? 'listing' : 'excerpt' },
  }, availability: { 'news.reading_size': () => articleId() === 'none' ? 'not_applicable' : 'available' } });
  const runtime = new BrowserRuntime({ observer, registry, presentation: driver, appContext, timeoutMs: 15000, maxActions: 200 });
  const tour = new GuidedTour({ observer, driver });
  const speech = new SpeechOutput({ window, lang: 'id-ID', localOnly: true });
  return { observer, driver, runtime, tour, speech, visible, dispose() { runtime.cancel(); tour.dispose(); speech.dispose(); driver.dispose(); } };
}

export const progressLabels = Object.freeze({ checking: 'Memeriksa permintaan', executing: 'Menjalankan aksi', verifying: 'Memeriksa hasil', navigation_pending: 'Menunggu halaman', verified: 'Terverifikasi', unverified: 'Hasil belum terverifikasi', failed: 'Aksi belum berhasil', cancelled: 'Dihentikan', timed_out: 'Waktu tunggu habis', replayed: 'Menggunakan hasil sebelumnya' });
