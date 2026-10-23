import { PageSquireError } from '@pagesquire/core';
import { AssistantClient, createHttpTransport } from '@pagesquire/client';
import { createPortalExperience, progressLabels } from './experience.js';
import manifest from './capabilities.json' with { type: 'json' };
import { parameters } from '../.build/parameter-bindings.mjs';

async function mountKabarinAssistant() {
await window.KABARIN_APP_READY;
const portal = window.KabarinPortal;
const data = window.KABARIN;
if (!portal || !data) throw new Error('Kabarin must be mounted before its assistant.');
const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${{
  chat: '<path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-6a8 8 0 1 1 18-4Z"/><path d="M7 10h8m-8 4h5"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  send: '<path d="m4 4 17 8-17 8 3-8-3-8Zm3 8h14"/>',
  reset: '<path d="M4 7v5h5M4 12a8 8 0 1 1 2 6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
}[name]}</svg>`;
const experience = createPortalExperience(portal, manifest, parameters);
const { runtime, tour, speech, visible } = experience;

const root = document.createElement('div');
root.className = 'k-ai';
root.setAttribute('data-pagesquire-root', '');
root.innerHTML = `<button class="k-ai-launcher" id="k-ai-launcher" aria-label="Buka Kabarin AI" aria-controls="k-ai-panel" aria-expanded="false">${svg('chat')}<span>Tanya Kabarin</span><span class="k-ai-launcher-dot"></span></button>
<section class="k-ai-panel" id="k-ai-panel" role="dialog" aria-label="Asisten Kabarin AI" hidden>
  <header class="k-ai-header"><span class="k-ai-avatar">${svg('spark')}</span><div><h2>Kabarin <span>AI</span></h2><p>Teman jelajah ceritamu.</p></div><div class="k-ai-header-tools"><button id="k-ai-refresh" class="k-ai-icon" aria-label="Periksa koneksi AI" title="Periksa koneksi AI">${svg('reset')}</button><button id="k-ai-close" class="k-ai-icon" aria-label="Tutup asisten">${svg('close')}</button></div></header>
  <div class="k-ai-status" id="k-ai-status" role="status"><span class="k-ai-status-dot"></span><span id="k-ai-status-text">Memeriksa koneksi…</span></div>
  <p class="k-ai-privacy" id="k-ai-quota" role="status" hidden></p>
  <div class="k-ai-operation" id="k-ai-operation" hidden><span id="k-ai-operation-text" role="status"></span><button type="button" id="k-ai-driving-stop">Hentikan</button></div>
  <div class="k-ai-log" id="k-ai-log" role="log" aria-label="Percakapan dengan Kabarin AI" aria-live="polite" aria-relevant="additions" tabindex="0"></div>
  <div class="k-ai-typing" id="k-ai-typing" hidden><span></span><span></span><span></span><p>Sedang memahami permintaanmu…</p></div>
  <div class="k-ai-quick"><span class="k-ai-quick-label">COBA PINTASAN</span><div class="k-ai-actions" id="k-ai-actions"></div></div>
  <details class="k-ai-timeline" id="k-ai-timeline" hidden><summary>Langkah asisten</summary><ol id="k-ai-steps"></ol></details>
  <div class="k-ai-extras"><button type="button" id="k-ai-tour">Tur singkat</button><button type="button" id="k-ai-speech" aria-pressed="false">Suara: mati</button><span>Animasi mengikuti preferensi perangkat</span></div>
  <form class="k-ai-form" id="k-ai-form"><label class="sr-only" for="k-ai-input">Pesan untuk Kabarin AI</label><textarea id="k-ai-input" rows="1" maxlength="4000" placeholder="Tulis pertanyaan atau minta bantuan…" disabled></textarea><button id="k-ai-send" type="submit" aria-label="Kirim pesan" disabled>${svg('send')}</button><button id="k-ai-stop" type="button" aria-label="Hentikan respons" hidden>${svg('stop')}</button></form>
  <div class="k-ai-footer"><span>PageSquire + SumoPod</span><button id="k-ai-new">Percakapan baru</button></div><p class="k-ai-privacy">AI membaca cuplikan berita publik melalui SumoPod. Buka tautan penerbit untuk naskah lengkap. Jangan bagikan data pribadi.</p>
</section>`;
document.body.append(root);
const $ = selector => root.querySelector(selector);
const log = $('#k-ai-log');
const input = $('#k-ai-input');
const panel = $('#k-ai-panel');
const launcher = $('#k-ai-launcher');
let session = null;
let sessionLoading = false;
let open = false;
let guidedBusy = false;
let seenClientMessages = 0;
let clientMessageFingerprint = '';
let latestState = { busy: false, messages: [] };
let logCount = 0;
let guidedController = null;
let audioEnabled = false;
let guidedProgress = [];

function welcome() {
  log.innerHTML = `<div class="k-ai-welcome"><div class="k-ai-welcome-symbol">${svg('spark')}</div><p class="k-ai-eyebrow">ASISTEN BACAANMU</p><h3>Rasa ingin tahu,<br>bertemu cerita baru.</h3><p>Hai! Aku bantu kamu menemukan berita, membuka bacaan, dan menjelajahi Kabarin dengan lebih mudah.</p><div class="k-ai-welcome-note">${svg('check')} Pintasan tetap bekerja tanpa chat AI.</div></div>`;
  logCount = 0;
}
welcome();
function append(role, text, success) {
  if (!logCount) log.replaceChildren();
  const row = document.createElement('div'); row.className = `k-ai-message k-ai-message-${role}`;
  if (role === 'action') { row.classList.add(success ? 'k-ai-verified' : 'k-ai-unverified'); const mark = document.createElement('span'); mark.innerHTML = success ? svg('check') : svg('close'); row.append(mark); }
  const body = document.createElement('p'); body.textContent = text; row.append(body); log.append(row);
  logCount++;
  if (log.children.length > 100) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
}
const errors = {
  PROVIDER_NOT_CONFIGURED: 'Chat AI belum diaktifkan. Kamu tetap bisa menggunakan pintasan di bawah.',
  PROVIDER_UNAVAILABLE: 'SumoPod belum dapat memberi respons yang sesuai. Periksa API key, model, dan koneksi server, lalu coba lagi.',
  INVALID_PROVIDER_RESPONSE: 'Respons AI belum sesuai format yang aman. Tidak ada aksi lanjutan yang dijalankan.',
  INVALID_PARAMETERS: 'Parameter aksi AI tidak sesuai. Coba jelaskan permintaanmu dengan lebih spesifik.',
  CAPABILITY_DENIED: 'Permintaan itu berada di luar aksi yang diizinkan di Kabarin.',
  NETWORK_ERROR: 'Koneksi ke server asisten terputus. Coba periksa koneksi kembali.',
  CSRF_MISMATCH: 'Sesi perlu diperbarui. Muat ulang halaman sebelum mencoba lagi.',
  HTTP_419: 'Sesi perlu diperbarui. Muat ulang halaman sebelum mencoba lagi.',
  HTTP_429: 'Batas penggunaan tercapai. Jika kuota harian masih ada, tunggu satu menit. Kuota harian reset 07.00 WIB; percakapan baru tidak menghapus batas.',
  HTTP_503: 'Layanan AI belum tersedia. Pintasan panduan tetap bisa digunakan.',
};
const englishMessages = {
  'The conversation was cancelled.': 'Permintaan dihentikan. Aksi yang sudah selesai tetap berlaku.',
  'The conversation exceeded its time limit.': 'Waktu tunggu habis. Coba permintaan yang lebih singkat.',
  'The conversation timed out.': 'Waktu tunggu habis. Coba permintaan yang lebih singkat.',
  'The assistant could not complete this request. Try again.': 'Permintaan belum berhasil diselesaikan. Silakan coba lagi.',
  'I could not verify that the action completed.': 'Hasil aksi belum dapat diverifikasi.',
  'I could not verify that the previous action completed. No further actions were run.': 'Aksi sebelumnya belum dapat diverifikasi. Tidak ada aksi lanjutan yang dijalankan.',
  'The conversation limit was reached. Start a new conversation.': 'Batas percakapan tercapai. Mulai percakapan baru untuk melanjutkan.',
};
function controls() {
  const busy = latestState.busy || guidedBusy || sessionLoading;
  const exhausted = session?.dailyQuota?.remaining === 0;
  input.disabled = !session?.configured || busy || exhausted;
  input.placeholder = session?.configured ? 'Tulis pertanyaan atau minta bantuan…' : 'Chat AI belum diaktifkan';
  $('#k-ai-send').disabled = !session?.configured || busy || exhausted;
  $('#k-ai-send').hidden = latestState.busy || !!guidedController;
  $('#k-ai-stop').hidden = !latestState.busy && !guidedController;
  $('#k-ai-typing').hidden = !latestState.busy;
  $('#k-ai-tour').disabled = busy;
  $('#k-ai-new').disabled = busy;
  $('#k-ai-refresh').disabled = busy;
  root.querySelectorAll('[data-guided]').forEach(button => { button.disabled = busy; });
}
function quotaStatus() {
  const quota=session?.dailyQuota,element=$('#k-ai-quota');
  element.hidden=!quota;
  if(quota)element.textContent=`Demo publik: sisa ${quota.remaining}/${quota.limit} pesan hari ini per jaringan. Reset 07.00 WIB. IP di-hash untuk kuota; incognito/percakapan baru tidak meresetnya. Jaringan bersama berbagi batas. Pintasan lokal tetap gratis.`;
  controls();
}
async function loadSession(signal) {
  sessionLoading = true; controls();
  $('#k-ai-status-text').textContent = 'Memeriksa koneksi…';
  try {
    if(location.protocol==='file:'){
      session=null;root.dataset.ready='false';
      $('#k-ai-status-text').textContent='Mode panduan · Buka lewat localhost untuk chat';
      return null;
    }
    const connectionSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000);
    const response = await fetch(new URL('api/assistant-session.php', document.baseURI), { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: connectionSignal, headers: { Accept: 'application/json' } });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Unavailable');
    const value = await response.json();
    if (typeof value.configured !== 'boolean' || typeof value.csrfToken !== 'string' || value.csrfToken.length < 16 || !value.endpoint || !value.resetEndpoint) throw new Error('Invalid session');
    for (const endpoint of [value.endpoint, value.resetEndpoint]) if (new URL(endpoint, location.href).origin !== location.origin) throw new Error('Invalid origin');
    session = value;
    quotaStatus();
    root.dataset.ready = value.configured ? 'true' : 'false';
    $('#k-ai-status-text').textContent = value.configured ? `AI siap menemani · ${value.provider || 'SumoPod'}` : 'Mode panduan · Chat AI belum diaktifkan';
    return value;
  } catch (error) {
    session = null; root.dataset.ready = 'false';
    $('#k-ai-status-text').textContent = 'Koneksi belum tersedia · Pintasan tetap aktif';
    if (signal?.aborted) throw error;
    return null;
  } finally { sessionLoading = false; controls(); }
}
const client = new AssistantClient({ runtime, maxRounds: 12, timeoutMs: 100000, transport: async (request, signal) => {
  const current = session ?? await loadSession(signal);
  if (!current?.configured) throw new PageSquireError('PROVIDER_NOT_CONFIGURED', errors.PROVIDER_NOT_CONFIGURED);
  const transport = createHttpTransport({ endpoint: current.endpoint, csrfToken: () => current.csrfToken, baseUrl: location.href, fetch:async(...args)=>{
    const response=await fetch(...args),remaining=response.headers.get('x-demo-remaining');
    if(current===session&&current.dailyQuota&&/^[0-5]$/.test(remaining??'')){current.dailyQuota.remaining=Number(remaining);quotaStatus();}
    return response;
  } });
  try { return await transport(request, signal); }
  catch (error) { if (error instanceof PageSquireError) throw new PageSquireError(error.code, errors[error.code] ?? 'Permintaan belum berhasil. Coba percakapan baru atau periksa koneksi.'); throw error; }
} });
const actionNames = { 'news.search': 'Pencarian berita', 'news.category': 'Kategori berita', 'news.open_article': 'Halaman artikel', 'news.collection': 'Koleksi berita', 'news.home': 'Beranda', 'news.saved': 'Bacaan tersimpan', 'news.bookmark': 'Status simpan artikel', 'news.theme': 'Tema tampilan', 'news.reading_size': 'Ukuran bacaan', 'news.section': 'Navigasi bagian halaman', 'page.read': 'Pembacaan isi artikel', 'page.scroll_to': 'Scroll halaman', 'page.highlight': 'Penanda bagian halaman' };
function renderProgress(entries, busy = latestState.busy) {
  const recent = entries.slice(-4);
  $('#k-ai-timeline').hidden = !recent.length;
  $('#k-ai-steps').replaceChildren(...recent.map(action => {
    const item = document.createElement('li'); item.dataset.stage = action.stage;
    const name = document.createElement('strong'); name.textContent = actionNames[action.capabilityId] ?? 'Aksi halaman';
    const status = document.createElement('span'); status.textContent = progressLabels[action.stage] ?? 'Memeriksa';
    item.append(name, status); return item;
  }));
  const last = recent.at(-1);
  $('#k-ai-operation').hidden = !busy;
  $('#k-ai-operation-text').textContent = !last ? 'Memahami permintaan…' : last.stage === 'verified' ? 'Langkah terverifikasi · Menyiapkan jawaban…' : `${actionNames[last.capabilityId] ?? 'Aksi halaman'} · ${progressLabels[last.stage] ?? 'Memeriksa'}`;
  root.dataset.driving = String(busy && last?.stage === 'executing');
  log.setAttribute('aria-busy', String(busy));
  $('#k-ai-typing p').textContent = last?.capabilityId === 'page.read' && last.stage === 'executing' ? 'Menelusuri isi bacaan…' : 'Menyiapkan respons…';
}
client.subscribe(state => {
  const wasBusy = latestState.busy;
  latestState = state;
  if (state.messages.length < seenClientMessages) seenClientMessages = 0;
  const fingerprint = JSON.stringify(state.messages);
  const incoming = state.messages.length === 100 && seenClientMessages === 100 && fingerprint !== clientMessageFingerprint ? state.messages.slice(-1) : state.messages.slice(seenClientMessages);
  for (const message of incoming) {
    if (message.role === 'action') { const id = message.text.split(':')[0]; append('action', `${actionNames[id] ?? 'Aksi'} ${message.status === 'success' ? 'terverifikasi' : 'belum berhasil'}.`, message.status === 'success'); }
    else { append(message.role, englishMessages[message.text] ?? message.text); if (message.role === 'assistant' && audioEnabled) void speech.speak(message.text.slice(0, 4000)); }
  }
  seenClientMessages = state.messages.length;
  clientMessageFingerprint = fingerprint;
  controls();
  renderProgress(state.actionProgress ?? [], state.busy);
  if (wasBusy && !state.busy && open && session?.configured) input.focus({ preventScroll: true });
});
function quickActions() {
  const currentId = /^#artikel\/([a-z0-9-]{1,70})$/.exec(location.hash)?.[1];
  const actions = [
    { label: 'Berita teknologi', id: 'news.category', parameters: { category: 'teknologi' } },
    { label: 'Paling populer', id: 'news.collection', parameters: { collection: 'populer' } },
    { label: 'Cari berita AI', id: 'news.search', parameters: { query: 'AI' } },
    { label: 'Pilihan editor', id: 'news.collection', parameters: { collection: 'editor' } },
    ...(currentId ? [{ label: 'Telusuri artikel', id: 'page.read', parameters: { scope: 'article', mode: 'full', offset: 0 } }, ...(session?.configured ? [{ label: 'Rangkum artikel', message: 'Telusuri artikel ini lalu rangkum isinya' }] : []), { label: portal.isSaved(currentId) ? 'Batalkan simpan' : 'Simpan artikel ini', id: 'news.bookmark', parameters: { articleId: currentId, saved: !portal.isSaved(currentId) } }, { label: 'Perbesar teks', id: 'news.reading_size', parameters: { size: 'large' } }] : [{ label: 'Buka & rangkum berita', message: 'Buka satu berita terbaru lalu telusuri dan rangkum isinya' }].filter(() => session?.configured)),
    { label: document.documentElement.dataset.theme === 'dark' ? 'Mode terang' : 'Mode gelap', id: 'news.theme', parameters: { theme: document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark' } },
    { label: 'Bacaan tersimpan', id: 'news.saved', parameters: {} },
  ];
  $('#k-ai-actions').replaceChildren(...actions.map(action => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = action.label; button.dataset.guided = action.id;
    button.addEventListener('click', () => { if (action.message) void sendMessage(action.message); else void guided(action); });
    return button;
  }));
  controls();
}
async function guided(action) {
  if (latestState.busy || guidedBusy) return;
  guidedBusy = true; controls(); append('user', action.label);
  guidedController = new AbortController(); guidedProgress = [];
  try {
    const snapshot = runtime.observe();
    const result = await runtime.execute({ protocolVersion: '0.1', callId: crypto.randomUUID(), capabilityId: action.id, snapshotId: snapshot.id, parameters: action.parameters }, { signal: guidedController.signal, onActionProgress: event => { const prior = guidedProgress.find(entry => entry.callId === event.callId); if (prior) Object.assign(prior, event); else guidedProgress.push({ ...event }); renderProgress(guidedProgress, true); } });
    append('action', result.status === 'success' ? `${actionNames[action.id]} terverifikasi.` : result.status === 'cancelled' ? 'Aksi dihentikan. Perubahan yang sudah selesai tetap berlaku.' : 'Aksi belum berhasil. Coba dari halaman yang sesuai.', result.status === 'success');
  } catch { append('assistant', 'Pintasan belum dapat dijalankan. Coba lagi setelah halaman siap.'); }
  finally { guidedController = null; guidedBusy = false; renderProgress(guidedProgress, false); quickActions(); controls(); }
}
async function show() {
  open = true; panel.hidden = false; launcher.setAttribute('aria-expanded', 'true'); launcher.setAttribute('aria-label', 'Tutup Kabarin AI');
  quickActions();
  if (!session) await loadSession();
  quickActions();
  if (session?.configured) input.focus({ preventScroll: true }); else $('#k-ai-close').focus({ preventScroll: true });
}
function stop() { client.cancel(); guidedController?.abort(); runtime.cancel(); tour.cancel(); setAudio(false); }
function close() { stop(); open = false; panel.hidden = true; launcher.setAttribute('aria-expanded', 'false'); launcher.setAttribute('aria-label', 'Buka Kabarin AI'); launcher.focus({ preventScroll: true }); }
launcher.addEventListener('click', () => { if (open) close(); else void show(); });
$('#k-ai-close').addEventListener('click', close);
$('#k-ai-refresh').addEventListener('click', () => { void loadSession(); });
$('#k-ai-stop').addEventListener('click', stop);
$('#k-ai-driving-stop').addEventListener('click', stop);
$('#k-ai-new').addEventListener('click', async () => {
  if (latestState.busy || guidedBusy) return;
  guidedBusy = true; controls();
  setAudio(false);
  try {
    if (!session) await loadSession();
    if (session) {
      const response = await fetch(session.resetEndpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: '{}' });
      if (!response.ok) throw new Error('Reset rejected');
    }
    client.reset(); seenClientMessages = 0; guidedProgress = []; renderProgress([], false); welcome(); input.value = '';
  } catch { append('assistant', 'Percakapan belum bisa direset di server. Periksa koneksi lalu coba lagi.'); }
  finally { guidedBusy = false; controls(); }
});
async function sendMessage(message) {
  if (!message || latestState.busy || guidedBusy || !session?.configured || session?.dailyQuota?.remaining === 0) return;
  speech.cancel();
  input.value = ''; input.style.height = '';
  try { await client.send(message); } catch { append('assistant', 'Tulis pesan hingga 4.000 karakter dan tunggu respons sebelumnya selesai.'); }
  quickActions();
}
$('#k-ai-form').addEventListener('submit', event => { event.preventDefault(); void sendMessage(input.value.trim()); });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 100)}px`; });
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); $('#k-ai-form').requestSubmit(); } });
root.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); if (latestState.busy) client.cancel(); else close(); } });
window.addEventListener('hashchange', () => { if (open) quickActions(); });
new MutationObserver(() => { if (open && !guidedBusy) quickActions(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
function localVoice() { return window.speechSynthesis?.getVoices().find(voice => voice.localService && /^id(?:-|$)/i.test(voice.lang)); }
function setAudio(enabled) {
  audioEnabled = enabled; speech.setEnabled(enabled);
  const button = $('#k-ai-speech'); button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? 'Suara: aktif' : 'Suara: mati';
}
function refreshVoice() {
  const available = !!localVoice(); $('#k-ai-speech').disabled = !available;
  $('#k-ai-speech').title = available ? 'Bacakan jawaban memakai suara Bahasa Indonesia lokal. Tidak memakai mikrofon.' : 'Suara Bahasa Indonesia lokal belum tersedia pada browser/perangkat ini.';
  if (!available) { setAudio(false); $('#k-ai-speech').textContent = 'Suara tak tersedia'; }
}
$('#k-ai-speech').addEventListener('click', () => { if (localVoice()) setAudio(!audioEnabled); });
window.speechSynthesis?.addEventListener('voiceschanged', refreshVoice);
refreshVoice();
$('#k-ai-tour').addEventListener('click', async () => {
  if (latestState.busy || guidedBusy) return;
  close(); guidedBusy = true; controls();
  const heading = () => visible('main h1');
  const steps = [
    { target: heading, text: 'Selamat datang di Kabarin. Jelajahi cerita melalui kategori, pencarian, atau minta bantuan Kabarin AI.' },
    ...(document.querySelector('#article-body') ? [{ target: () => visible('#article-body'), text: 'Inilah cuplikan dari sumber berita. Pilih “Rangkum artikel” untuk ringkasan AI, atau tautan penerbit untuk membaca naskah lengkap.' }] : document.querySelector('#latest-section') ? [{ target: () => visible('#latest-section h2'), text: 'Kabar Terbaru diambil dari feed penerbit. Gunakan filter kategori dan tombol muat lainnya untuk menjelajah.' }] : []),
    { target: () => visible('.utility-actions a[href="#tersimpan"]'), text: 'Simpan cerita yang menarik. Bacaan tersimpan tersedia kembali di browser ini.' },
    { target: () => visible('#theme-toggle'), text: 'Atur tema terang atau gelap. Kabarin AI juga bisa mengubah tema melalui perintahmu.' },
  ];
  let translation;
  try {
    const running = tour.start(steps);
    const tourRoot = document.querySelector('.pagesquire-tour');
    const translate = () => {
      tourRoot?.setAttribute('aria-label', 'Tur singkat Kabarin');
      for (const button of tourRoot?.querySelectorAll('button') ?? []) {
        const label = { Previous: 'Sebelumnya', Next: 'Lanjut', Finish: 'Selesai', 'Stop tour': 'Hentikan tur' }[button.textContent];
        if (label) button.textContent = label;
      }
    };
    translation = new MutationObserver(translate); if (tourRoot) translation.observe(tourRoot, { childList: true, subtree: true }); translate();
    await running;
  } catch { append('assistant', 'Tur belum dapat diteruskan pada halaman ini.'); }
  finally { translation?.disconnect(); guidedBusy = false; controls(); launcher.focus({ preventScroll: true }); }
});
window.addEventListener('pagehide', () => { stop(); experience.dispose(); window.speechSynthesis?.removeEventListener('voiceschanged', refreshVoice); }, { once: true });
quickActions();
}
void mountKabarinAssistant();
