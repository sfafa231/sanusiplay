/* ============================================================
   SanusiPlay — Cari & Nonton Video Tanpa Iklan
   Hak cipta © 2026 Sanusi · Logo AMIK Serang
   Server: API publik Piped & Invidious (tanpa kunci API)
   ============================================================ */
'use strict';

const APP_VERSION = '1.1.0';
const K = { pref: 'splay_pref_v1', saved: 'splay_saved_v1', shield: 'splay_shield_v1' };

/* Server pencarian (sudah diuji hidup & mengizinkan CORS) */
const INSTANCES = [
  { id: 'piped-coffee', type: 'piped', base: 'https://api.piped.private.coffee', label: 'Piped·Coffee' },
  { id: 'piped-ducks', type: 'piped', base: 'https://pipedapi.ducks.party', label: 'Piped·Ducks' },
  { id: 'inv-f5', type: 'invidious', base: 'https://invidious.f5.si', label: 'Invidious·F5' }
];

const TOPICS = [
  { q: 'musik terbaru 2026', label: '🎵 Musik' },
  { q: 'game online', label: '🎮 Gaming' },
  { q: 'berita terkini indonesia', label: '📰 Berita' },
  { q: 'tutorial pemrograman', label: '💻 Belajar' },
  { q: 'sepak bola', label: '⚽ Olahraga' },
  { q: 'teknologi gadget', label: '🚀 Teknologi' },
  { q: 'film trailer', label: '🎬 Film' },
  { q: 'podcast', label: '🎙️ Podcast' },
  { q: 'resep masakan', label: '🍳 Kuliner' },
  { q: 'vlog', label: '🎥 Vlog' }
];

/* Pola domain iklan/pelacak yang DIBLOKIR oleh perisai */
const AD_PATTERN = /doubleclick|googlesyndication|googleadservices|pagead|adservice|adnxs|adsystem|adtech|taboola|outbrain|criteo|pubmatic|rubiconproject|openx|smartadserver|adform|moatads|scorecardresearch|quantserve|hotjar|facebook\.net|googletagmanager|google-analytics|adsrvr|adcolony|unityads|applovin|inmobi|vungle/i;

/* ---------------- Penyimpanan ---------------- */
let prefs = loadJSON(K.pref, {});
let saved = loadJSON(K.saved, []);
let shield = loadJSON(K.shield, { ad: 0, other: 0 });
if (!prefs.theme) prefs.theme = 'dark';
delete prefs.mode; // v1.1.0: pemutar resmi beriklan dihapus total — tak ada mode lagi
if (!prefs.region) prefs.region = 'ID';

function loadJSON(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
  catch (e) { return fallback; }
}
function saveJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* penuh */ }
}

/* ---------------- Status aplikasi ---------------- */
const state = { view: 'home', query: '', results: [], trendCache: {}, lastHealthy: null, playing: null, details: null, descOpen: false, plans: [], planIdx: 0, autoRetried: false };

/* ---------------- Utilitas ---------------- */
const NF = new Intl.NumberFormat('id-ID');
const $ = id => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
function fmtViews(n) {
  n = Number(n);
  if (!isFinite(n) || n < 0) return '';
  return `${NF.format(n)} x ditonton`;
}
function statsLine(v) {
  return [fmtViews(v.views), v.uploaded].filter(Boolean).join(' • ');
}
function thumbFor(id) { return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; }
function extractId(u) {
  if (!u) return null;
  const m = String(u).match(/(?:v=\/?|\/watch\?v=|youtu\.be\/|\/shorts\/|\/embed\/)([\w-]{11})/);
  if (m) return m[1];
  return /^[\w-]{11}$/.test(String(u)) ? String(u) : null;
}

/* ---------------- Tema ---------------- */
function applyTheme() {
  const dark = prefs.theme === 'dark' ||
    (prefs.theme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#2563eb');
}
function syncThemeSeg() {
  document.querySelectorAll('#themeSeg button').forEach(b =>
    b.classList.toggle('active', b.dataset.themeChoice === prefs.theme));
}

/* ---------------- Perisai Sanusi (CSP) ---------------- */
function updateShieldUI() {
  const el = $('shieldCount'); if (el) el.textContent = NF.format(shield.ad);
  $('statAdBlocked').textContent = NF.format(shield.ad);
  $('statOtherBlocked').textContent = NF.format(shield.other);
  $('statWhitelisted').textContent = String(INSTANCES.length + 3);
}
function countViolation(uri) {
  if (AD_PATTERN.test(String(uri))) {
    shield.ad++; toast('🛡️ Iklan diblokir: ' + String(uri).replace(/^https?:\/\//, '').slice(0, 44));
  } else {
    shield.other++;
  }
  saveJSON(K.shield, shield);
  updateShieldUI();
}
function watchShield() {
  document.addEventListener('securitypolicyviolation', e =>
    countViolation(e.blockedURI || e.violatedDirective || ''));
}
/* Lapis ke-2: cegat di level JavaScript. Sekalipun ada kode jahat,
   fetch() ke domain iklan ditolak SEBELUM keluar dari perangkat. */
function installNetworkGuard() {
  if (typeof window === 'undefined' || !window.fetch) return;
  const real = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) { url = ''; }
    if (url && AD_PATTERN.test(url)) {
      countViolation(url);
      return Promise.reject(new Error('Ditolak Perisai Mutlak Sanusi'));
    }
    return real(input, init);
  };
}

/* ---------------- Jaringan ---------------- */
function fetchJSON(url, ms = 9000) {
  const AC = typeof AbortController !== 'undefined' ? AbortController : null;
  const ctrl = AC ? new AC() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  return fetch(url, ctrl ? { signal: ctrl.signal, headers: { 'Accept': 'application/json' } } : { headers: { 'Accept': 'application/json' } })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .finally(() => { if (timer) clearTimeout(timer); });
}

/* Coba tiap server sampai satu berhasil — tahan banting */
async function tryInstances(pathOf) {
  const all = INSTANCES.map((_, i) => i);
  const order = state.lastHealthy != null ? [state.lastHealthy, ...all.filter(i => i !== state.lastHealthy)] : all;
  let lastErr = null;
  for (const i of order) {
    try {
      const data = await fetchJSON(pathOf(INSTANCES[i]));
      state.lastHealthy = i;
      return { inst: INSTANCES[i], data };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('semua server gagal');
}

/* ---------------- Normalisasi data ---------------- */
function normPipedItem(it) {
  if (!it) return null;
  const id = extractId(it.url || it.id);
  if (!id || (it.type && it.type !== 'stream')) return null;
  return {
    id, title: it.title || 'Tanpa judul',
    channel: it.uploaderName || it.uploader || '',
    duration: Number(it.duration) || 0,
    views: it.views != null ? Number(it.views) : null,
    uploaded: it.uploadedDate || it.uploadedText || '',
    thumb: thumbFor(id)
  };
}
function normInvItem(it) {
  if (!it || !it.videoId) return null;
  return {
    id: it.videoId, title: it.title || 'Tanpa judul', channel: it.author || '',
    duration: Number(it.lengthSeconds) || 0,
    views: it.viewCount != null ? Number(it.viewCount) : null,
    uploaded: it.publishedText || '',
    thumb: thumbFor(it.videoId)
  };
}
function normList(inst, data) {
  const raw = inst.type === 'piped' ? (Array.isArray(data) ? data : (data && data.items) || []) : (Array.isArray(data) ? data : []);
  const norm = inst.type === 'piped' ? normPipedItem : normInvItem;
  return raw.map(norm).filter(Boolean);
}
function mediaKind(f) { return String((f && (f.mimeType || f.type)) || '').toLowerCase(); }
function isAudioF(f) { return /^audio\//.test(mediaKind(f)); }
function isVideoF(f) { return /^video\//.test(mediaKind(f)); }
function isMp4(f) { return /mp4|m4a/.test(mediaKind(f)); }
function qNum(f) {
  if (!f) return 0;
  const m = String(f.qualityLabel || f.quality || f.resolution || '').match(/\d{2,4}/);
  return m ? parseInt(m[0], 10) : 0;
}
function pickBest(list, score) {
  const ok = (list || []).filter(f => f && f.url);
  if (!ok.length) return null;
  return ok.slice().sort((a, b) => score(b) - score(a))[0];
}
/* Aliran gabungan (video+audio satu berkas) — paling andal, satu elemen saja */
function pickMuxed(list) {
  return pickBest(list, f => (isMp4(f) ? 1000 : 0) + qNum(f));
}
/* Aliran video-saja — untuk dipasangkan dengan aliran audio */
function pickVideoOnly(list) {
  return pickBest(list, f => (isMp4(f) ? 1000 : 0) + qNum(f));
}
/* Aliran audio-saja — utamakan m4a/mp4, lalu bitrate tertinggi */
function pickAudioOnly(list) {
  return pickBest(list, f => (isMp4(f) ? 1000 : 0) + Math.round((Number(f.bitrate) || 0) / 1000));
}
/* Kumpulkan semua kandidat aliran dari data Piped / Invidious */
function collectStreams(inst, d) {
  const muxed = [], video = [], audio = [];
  const addMux = f => { if (f && f.url) muxed.push(f); };
  if (inst.type === 'invidious') {
    (d.formatStreams || []).forEach(addMux);
    (d.adaptiveFormats || []).forEach(f => {
      if (!f || !f.url) return;
      if (isAudioF(f)) audio.push(f);
      else if (isVideoF(f)) {
        if (f.audioQuality && String(f.audioQuality).trim()) addMux(f); // adaptif bersuara → bisa diputar tunggal
        else video.push(f);
      }
    });
  } else {
    (d.formatStreams || []).forEach(addMux);
    (d.videoStreams || []).forEach(f => {
      if (!f || !f.url) return;
      if (isAudioF(f)) audio.push(f);
      else if (f.videoOnly === true) video.push(f);
      else addMux(f);
    });
    (d.audioStreams || []).forEach(f => { if (f && f.url) audio.push(f); });
  }
  return { muxed, video, audio };
}
/* Susun rencana pemutaran bebas iklan (urut prioritas). Semua lewat stream langsung. */
function buildPlans(st) {
  const mux = pickMuxed(st.muxed);
  const vid = pickVideoOnly(st.video);
  const aud = pickAudioOnly(st.audio);
  const single = mux ? { kind: 'muxed', url: mux.url } : null;
  const pair = (vid && aud) ? { kind: 'pair', url: vid.url, audio: aud.url } : null;
  const plans = [];
  if (single && pair) {
    // Pasangan dipakai lebih dulu bila mutunya jauh lebih baik (mis. 1080p vs 360p)
    if (qNum(vid) >= 720 && qNum(vid) > qNum(mux) + 180) plans.push(pair, single);
    else plans.push(single, pair);
  } else if (single) plans.push(single);
  else if (pair) plans.push(pair);
  return plans;
}
function normDetails(inst, d, id) {
  const streams = collectStreams(inst, d);
  const plans = buildPlans(streams);
  const related = inst.type === 'invidious'
    ? (d.recommendedVideos || []).map(r => ({
        id: r.videoId, title: r.title, channel: r.author,
        duration: Number(r.lengthSeconds) || 0,
        views: r.viewCount != null ? Number(r.viewCount) : null,
        uploaded: r.publishedText || ''
      }))
    : (d.relatedStreams || []).map(r => {
        const rid = extractId(r.url);
        return rid ? {
          id: rid, title: r.title, channel: r.uploaderName || '',
          duration: Number(r.duration) || 0,
          views: r.views != null ? Number(r.views) : null, uploaded: ''
        } : null;
      });
  const av = (d.authorThumbnails || []).slice(-1)[0];
  return {
    id, title: d.title || '',
    channel: inst.type === 'invidious' ? (d.author || '') : (d.uploader || ''),
    channelId: inst.type === 'invidious' ? (d.authorId || '') : '',
    views: d.viewCount != null ? Number(d.viewCount) : (d.views != null ? Number(d.views) : null),
    uploaded: d.publishedText || d.uploadDate || d.uploadedDate || '',
    desc: String(d.description || '').trim(),
    avatar: inst.type === 'invidious' ? (av ? av.url : '') : (d.uploaderAvatar || ''),
    plans,
    streamCount: streams.muxed.length + streams.video.length + streams.audio.length,
    related: related.filter(r => r && extractId(r.id))
  };
}

/* Ambil data utama */
const searchVideos = q => tryInstances(inst =>
  inst.type === 'piped'
    ? `${inst.base}/search?q=${encodeURIComponent(q)}&filter=videos`
    : `${inst.base}/api/v1/search?q=${encodeURIComponent(q)}&type=video`
).then(({ inst, data }) => ({ inst, list: normList(inst, data) }));

const trendingVideos = region => tryInstances(inst =>
  `${inst.base}${inst.type === 'piped' ? '/trending?region=' : '/api/v1/trending?region='}${encodeURIComponent(region)}`
).then(({ inst, data }) => ({ inst, list: normList(inst, data) }));

const getDetails = id => tryInstances(inst =>
  `${inst.base}${inst.type === 'piped' ? '/streams/' : '/api/v1/videos/'}${id}`
).then(({ inst, data }) => normDetails(inst, data, id));

/* ---------------- Render kartu video ---------------- */
function cardHTML(v, opts = {}) {
  const dur = fmtDur(v.duration);
  const stats = statsLine(v);
  const thumb = v.thumb || thumbFor(v.id);
  return `<article class="video-card" data-vid="${esc(v.id)}" role="button" tabindex="0">
    <div class="thumb-wrap">
      ${opts.removable ? `<button class="v-remove" type="button" data-unsave="${esc(v.id)}" aria-label="Hapus dari simpanan">✕</button>` : ''}
      <img src="${esc(thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">
      <div class="play-ico"><span>▶</span></div>
      ${dur ? `<span class="dur">${dur}</span>` : ''}
    </div>
    <div class="v-body">
      <p class="v-title">${esc(v.title)}</p>
      <span class="v-channel">${esc(v.channel)}</span>
      ${stats ? `<span class="v-stats">${esc(stats)}</span>` : ''}
    </div>
  </article>`;
}
function renderGrid(el, items, opts = {}) {
  if (!items.length) return false;
  el.innerHTML = items.map(v => cardHTML(v, opts)).join('');
  return true;
}
function renderSkeleton(el, n = 8) {
  el.innerHTML = Array.from({ length: n }, () =>
    `<div class="skeleton"><div class="sk-thumb"></div><div class="sk-line"></div><div class="sk-line short"></div></div>`
  ).join('');
}
function renderState(el, em, title, html, btn) {
  el.innerHTML = `<div class="state-card">
    <span class="em">${em}</span><b>${esc(title)}</b><p>${html}</p>
    ${btn ? `<button class="chip" type="button" ${btn.attr}>${esc(btn.label)}</button>` : ''}
  </div>`;
}

/* ---------------- Tampilan: Beranda ---------------- */
async function loadTrending(force = false) {
  const region = prefs.region;
  if (!force && state.trendCache[region]) {
    renderGrid($('homeGrid'), state.trendCache[region]);
    return;
  }
  renderSkeleton($('homeGrid'));
  try {
    const { list } = await trendingVideos(region);
    if (list.length) state.trendCache[region] = list; // jangan simpan daftar kosong agar tak mengunci beranda
    if (!renderGrid($('homeGrid'), list)) {
      renderState($('homeGrid'), '🎬', 'Belum ada trending', 'Server tidak mengembalikan video. Coba muat ulang.', { attr: 'data-retry="trend"', label: 'Coba lagi' });
    }
  } catch (e) {
    renderState($('homeGrid'), '📡', 'Gagal memuat trending',
      'Semua server video tidak terjangkau. Periksa koneksi internet Baginda, lalu coba lagi.',
      { attr: 'data-retry="trend"', label: 'Coba lagi' });
  }
}

/* ---------------- Tampilan: Cari ---------------- */
async function doSearch(q) {
  q = String(q || '').trim();
  if (!q) return;
  state.query = q;
  $('searchInput').value = q;
  $('btnClearSearch').hidden = false;
  $('searchTitle').textContent = `Hasil untuk “${q}”`;
  $('searchMeta').textContent = 'Mencari di server video…';
  switchView('search');
  renderSkeleton($('searchGrid'));
  try {
    const { inst, list } = await searchVideos(q);
    state.results = list;
    $('searchMeta').textContent = list.length
      ? `${list.length} hasil • via ${inst.label}`
      : '';
    if (!renderGrid($('searchGrid'), list)) {
      renderState($('searchGrid'), '🔍', 'Tidak ada hasil',
        `Tidak ditemukan video untuk “${esc(q)}”. Coba kata kunci lain.`, null);
    }
  } catch (e) {
    $('searchMeta').textContent = '';
    renderState($('searchGrid'), '😵', 'Pencarian gagal',
      'Semua server video sedang sibuk atau terblokir jaringan. Coba beberapa saat lagi.',
      { attr: 'data-retry="search"', label: 'Ulangi pencarian' });
  }
}

/* ---------------- Tampilan: Simpanan ---------------- */
function renderSaved() {
  const el = $('savedGrid');
  if (!saved.length) {
    renderState(el, '🔖', 'Belum ada simpanan',
      'Tekan tombol <b>🔖 Simpan</b> saat menonton untuk menyimpan video di sini.', null);
    return;
  }
  renderGrid(el, saved, { removable: true });
}
function isSaved(id) { return saved.some(s => s.id === id); }
function toggleSave(meta) {
  if (isSaved(meta.id)) {
    saved = saved.filter(s => s.id !== meta.id);
    toast('Dihapus dari simpanan');
  } else {
    saved.unshift({
      id: meta.id, title: meta.title, channel: meta.channel || '',
      duration: meta.duration || 0, views: meta.views != null ? meta.views : null,
      uploaded: meta.uploaded || '', thumb: thumbFor(meta.id)
    });
    toast('🔖 Tersimpan!');
  }
  saveJSON(K.saved, saved);
  syncSaveBtn();
  renderSaved();
  renderSettingsInfo();
}
function syncSaveBtn() {
  const btn = $('btnSaveVideo');
  const id = state.playing;
  if (!id) return;
  const on = isSaved(id);
  btn.classList.toggle('saved', on);
  btn.textContent = on ? '✔️ Tersimpan' : '🔖 Simpan';
}

/* ---------------- Pemutar: Perisai Mutlak (hanya aliran langsung, nol bingkai YouTube) ---------------- */
function safePlay(el) {
  try { const p = el && el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* autoplay ditolak browser */ }
}
function setBadge(kind, extra) {
  const b = $('playerModeBadge');
  b.className = 'mode-badge ' + kind;
  b.textContent = kind === 'shield' ? '🛡️ IKLAN-NOL' + (extra ? ' · ' + extra : '')
    : kind === 'error' ? '⛔ TERKUNCI'
    : 'MENYIAPKAN…';
}
/* Rencana 1: satu aliran gabungan (video+audio) */
function mountMuxed(plan, onFail) {
  if (!plan || !plan.url) return false;
  const stage = $('playerStage');
  stage.dataset.mode = 'muxed';
  stage.innerHTML = `<video id="playerVideo" controls autoplay playsinline preload="metadata" src="${esc(plan.url)}"></video>`;
  const v = $('playerVideo');
  v.addEventListener('error', () => onFail('Aliran gabungan gagal'), { once: true });
  safePlay(v);
  return true;
}
/* Rencana 2: dua aliran terpisah (video-saja + audio-saja) yang disinkronkan */
function mountPair(plan, onFail) {
  if (!plan || !plan.url || !plan.audio) return false;
  const stage = $('playerStage');
  stage.dataset.mode = 'pair';
  stage.innerHTML =
    `<video id="playerVideo" controls autoplay playsinline preload="metadata" src="${esc(plan.url)}"></video>` +
    `<audio id="playerAudio" preload="auto" src="${esc(plan.audio)}" hidden></audio>`;
  const v = $('playerVideo'), a = $('playerAudio');
  let dead = false;
  const fail = () => { if (!dead) { dead = true; onFail('Aliran video/audio gagal'); } };
  v.addEventListener('error', fail, { once: true });
  a.addEventListener('error', fail, { once: true });
  const seekSync = () => { try { a.currentTime = v.currentTime; } catch (e) { /* abaikan */ } };
  const driftSync = () => {
    if (v.seeking) return;
    if (Math.abs((a.currentTime || 0) - (v.currentTime || 0)) > 0.5) seekSync();
  };
  v.addEventListener('play', () => { seekSync(); safePlay(a); });
  v.addEventListener('pause', () => { try { a.pause(); } catch (e) { /* abaikan */ } });
  v.addEventListener('seeking', seekSync);
  v.addEventListener('seeked', seekSync);
  v.addEventListener('timeupdate', driftSync);
  v.addEventListener('ratechange', () => { try { a.playbackRate = v.playbackRate; } catch (e) { /* abaikan */ } });
  // Kontrol suara asli (volume/senyap) pada <video> diteruskan ke elemen audio
  v.addEventListener('volumechange', () => { try { a.muted = v.muted; a.volume = v.volume; } catch (e) { /* abaikan */ } });
  v.addEventListener('ended', () => { try { a.pause(); } catch (e) { /* abaikan */ } });
  safePlay(v);
  return true;
}
/* Semua jalur gagal → kartu galat (BUKAN pemutar YouTube beriklan) */
function showStreamError(det, reason = 'path') {
  setBadge('error');
  const stage = $('playerStage');
  stage.dataset.mode = 'error';
  const serverDown = reason === 'server';
  const title = serverDown ? 'Server sedang sibuk' : 'Tidak ada jalur bebas iklan';
  const hint = serverDown
    ? 'Semua server video sedang diblokir YouTube atau sedang pulih — inilah risiko API publik. '
      + 'Coba lagi beberapa saat lagi.'
    : (det && det.streamCount
      ? 'Jalur bebas iklan terputus — tautan stream mungkin kedaluwarsa atau jaringan tersendat.'
      : 'Server tidak mengirim jalur video apa pun untuk tayangan ini.');
  stage.innerHTML = `<div class="stage-error">
      <span class="em">🛡️</span>
      <b>${esc(title)}</b>
      <small>${esc(hint)}</small>
      <small>Perisai Mutlak menolak memutar lewat pemutar YouTube yang beriklan, agar <b>tak satu pun iklan lolos</b>.</small>
      <div class="btn-col">
        <button class="btn primary" type="button" data-retry="stream">🔄 Coba lagi</button>
        <a class="btn ghost" href="https://www.youtube.com/watch?v=${esc((det && det.id) || state.playing || '')}" target="_blank" rel="noopener">Buka di YouTube ↗</a>
      </div>
    </div>`;
}
function tryPlan() {
  const plan = (state.plans || [])[state.planIdx];
  if (!plan) { showStreamError(state.details); return; }
  setBadge('shield', plan.kind === 'pair' ? '2 ALIRAN' : '');
  const onFail = () => {
    if (state.planIdx + 1 < (state.plans || []).length) { state.planIdx++; tryPlan(); }
    else showStreamError(state.details);
  };
  const ok = plan.kind === 'muxed' ? mountMuxed(plan, onFail) : mountPair(plan, onFail);
  if (!ok) onFail();
}
async function startPlayback(meta) {
  if (state.playing !== meta.id) state.autoRetried = false; // video baru → ulang-otomatis dipulihkan
  state.playing = meta.id;
  state.descOpen = false;
  state.plans = [];
  state.planIdx = 0;
  $('plDesc').hidden = true;
  $('btnDesc').hidden = true;
  $('playerBarTitle').textContent = meta.title || 'Memuat…';
  $('plTitle').textContent = meta.title || 'Memuat…';
  $('plChannel').textContent = meta.channel || '—';
  $('plStats').textContent = statsLine(meta) || '—';
  $('btnOpenYt').href = `https://www.youtube.com/watch?v=${meta.id}`;
  $('btnOpenYt').hidden = false;
  $('plDesc').textContent = '';
  $('plAvatar').hidden = true;
  $('plAvatar').removeAttribute('src');
  syncSaveBtn();
  setBadge('wait');
  $('playerStage').innerHTML = `<div class="stage-loading"><span class="spinner"></span><small>Menyiapkan pemutar bebas iklan…</small></div>`;
  $('plRelated').innerHTML = '';

  let det = null;
  try { det = await getDetails(meta.id); } catch (e) { det = null; }
  if (state.playing !== meta.id) return; // pemutar sudah berpindah video
  state.details = det;

  if (det) {
    if (det.title) { $('plTitle').textContent = det.title; $('playerBarTitle').textContent = det.title; }
    if (det.channel) $('plChannel').textContent = det.channel;
    const st = statsLine(det); if (st) $('plStats').textContent = st;
    if (det.avatar) { $('plAvatar').src = det.avatar; $('plAvatar').hidden = false; }
    if (det.desc) {
      $('plDesc').textContent = det.desc;
      $('btnDesc').hidden = false;
    }
    renderGrid($('plRelated'), det.related.slice(0, 12));
  }

  state.plans = (det && det.plans) ? det.plans.slice() : [];
  state.planIdx = 0;
  if (state.plans.length) {
    state.autoRetried = false;
    tryPlan();
    return;
  }
  if (!det && !state.autoRetried) {
    // Server sedang lumpuh → SATU kali coba-ulang otomatis sebelum menyerah jujur
    state.autoRetried = true;
    $('playerStage').innerHTML =
      `<div class="stage-loading"><span class="spinner"></span><small>Server sedang sibuk — mencoba ulang otomatis…</small></div>`;
    setTimeout(() => { if (state.playing === meta.id) startPlayback(videoMetaFromId(meta.id)); }, 1500);
    return;
  }
  showStreamError(det, det ? 'none' : 'server'); // det=null → semua server tumbang
}
function openPlayer(meta) {
  if (!meta || !meta.id) return;
  $('player').hidden = false;
  document.body.style.overflow = 'hidden';
  startPlayback(meta);
}
function closePlayer() {
  $('player').hidden = true;
  document.body.style.overflow = '';
  const stage = $('playerStage');
  stage.innerHTML = ''; // hentikan video & audio
  delete stage.dataset.mode;
  state.playing = null;
  state.details = null;
  state.plans = [];
  state.planIdx = 0;
  $('playerBarTitle').textContent = 'Memuat…';
}
function videoMetaFromId(id) {
  const pools = [...state.results, ...saved, ...(state.trendCache[prefs.region] || []),
    ...(state.details ? state.details.related : [])];
  return pools.find(v => v && v.id === id) || { id, title: '', channel: '' };
}

/* ---------------- Navigasi ---------------- */
function switchView(name) {
  state.view = name;
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  if (name === 'home') loadTrending();
  if (name === 'saved') renderSaved();
  if (name === 'settings') renderSettingsInfo();
  window.scrollTo({ top: 0 });
}

/* ---------------- Pengaturan ---------------- */
function renderSettingsInfo() {
  $('aboutVersion').textContent = 'Versi ' + APP_VERSION;
  $('aboutSaved').textContent = `${saved.length} video`;
  $('aboutNet').textContent = navigator.onLine ? '🟢 Online' : '🔴 Offline';
  $('trendRegion').textContent = regionLabel(prefs.region);
  $('regionSelect').value = prefs.region;
  updateShieldUI();
  syncThemeSeg();
}
function regionLabel(code) {
  const opt = [...$('regionSelect').options].find(o => o.value === code);
  return opt ? opt.textContent.replace(/^\S+\s/, '') : code;
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ---------------- Peristiwa ---------------- */
function wire() {
  // Navigasi bawah & tombol merek
  document.querySelectorAll('.nav-item').forEach(b =>
    b.addEventListener('click', () => switchView(b.dataset.view)));
  $('btnBrand').addEventListener('click', () => switchView('home'));

  // Pencarian
  $('searchForm').addEventListener('submit', e => { e.preventDefault(); doSearch($('searchInput').value); });
  $('btnClearSearch').addEventListener('click', () => {
    $('searchInput').value = '';
    $('btnClearSearch').hidden = true;
    $('searchInput').focus();
  });
  $('searchInput').addEventListener('input', () => {
    $('btnClearSearch').hidden = !$('searchInput').value;
  });

  // Topik trending
  $('topicChips').innerHTML = TOPICS.map(t =>
    `<button class="chip" type="button" data-topic="${esc(t.q)}">${t.label}</button>`).join('');
  $('topicChips').addEventListener('click', e => {
    const c = e.target.closest('[data-topic]');
    if (c) doSearch(c.dataset.topic);
  });
  $('btnRefreshTrend').addEventListener('click', () => loadTrending(true));

  // Klik kartu video (di mana pun) + tombol hapus simpanan + tombol coba-ulang
  document.addEventListener('click', e => {
    const unsave = e.target.closest('[data-unsave]');
    if (unsave) {
      e.stopPropagation();
      saved = saved.filter(s => s.id !== unsave.dataset.unsave);
      saveJSON(K.saved, saved);
      renderSaved();
      renderSettingsInfo();
      toast('Dihapus dari simpanan');
      return;
    }
    const retry = e.target.closest('[data-retry]');
    if (retry) {
      if (retry.dataset.retry === 'trend') loadTrending(true);
      if (retry.dataset.retry === 'search') doSearch(state.query);
      if (retry.dataset.retry === 'stream' && state.playing) {
        state.autoRetried = false; // coba-ulang manual diberi jatah coba-ulang otomatis
        startPlayback(videoMetaFromId(state.playing));
      }
      return;
    }
    const card = e.target.closest('[data-vid]');
    if (card && card.dataset.vid) { openPlayer(videoMetaFromId(card.dataset.vid)); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest && e.target.closest('[data-vid]');
      if (card) { e.preventDefault(); openPlayer(videoMetaFromId(card.dataset.vid)); }
    }
    if (e.key === 'Escape' && !$('player').hidden) closePlayer();
  });

  // Gambar gagal muat → ubah jadi ubin ramah
  document.addEventListener('error', e => {
    const t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    if (t.classList.contains('pl-avatar')) { t.hidden = true; return; }
    const wrap = t.closest('.thumb-wrap');
    if (wrap && !wrap.querySelector('.fallback')) {
      t.style.display = 'none';
      const fb = document.createElement('div');
      fb.className = 'fallback';
      fb.textContent = '🎬';
      wrap.appendChild(fb);
    }
  }, true);

  // Pemutar
  $('btnClosePlayer').addEventListener('click', closePlayer);
  $('btnSaveVideo').addEventListener('click', () => {
    const meta = state.details && state.details.id === state.playing
      ? { ...state.details, duration: (videoMetaFromId(state.playing) || {}).duration }
      : videoMetaFromId(state.playing);
    toggleSave(meta);
  });
  $('btnOpenYt').addEventListener('click', () => { /* biarkan browser membuka tab baru */ });
  $('btnDesc').addEventListener('click', () => {
    state.descOpen = !state.descOpen;
    $('plDesc').hidden = !state.descOpen;
    $('btnDesc').textContent = state.descOpen ? 'Sembunyikan deskripsi ▴' : 'Lihat deskripsi ▾';
  });

  // Pengaturan
  $('themeSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-theme-choice]');
    if (!b) return;
    prefs.theme = b.dataset.themeChoice;
    saveJSON(K.pref, prefs);
    applyTheme();
    renderSettingsInfo();
  });
  $('btnTheme').addEventListener('click', () => {
    prefs.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    saveJSON(K.pref, prefs);
    applyTheme();
    renderSettingsInfo();
    toast('Tema: ' + (prefs.theme === 'dark' ? 'Gelap' : 'Terang'));
  });
  $('regionSelect').addEventListener('change', e => {
    prefs.region = e.target.value;
    saveJSON(K.pref, prefs);
    renderSettingsInfo();
    loadTrending(true);
    toast('Trending: ' + regionLabel(prefs.region));
  });

  // Bersihkan simpanan (dua ketuk agar tidak salah hapus)
  let clearArmed = false, clearTimer = null;
  $('btnClearSaved').addEventListener('click', () => {
    if (!clearArmed) {
      clearArmed = true;
      $('btnClearSaved').textContent = 'Tekan lagi untuk menghapus permanen';
      $('btnClearSaved').classList.add('danger-text');
      clearTimer = setTimeout(() => {
        clearArmed = false;
        $('btnClearSaved').textContent = 'Bersihkan Simpanan';
        $('btnClearSaved').classList.remove('danger-text');
      }, 3000);
      return;
    }
    clearTimeout(clearTimer);
    clearArmed = false;
    $('btnClearSaved').textContent = 'Bersihkan Simpanan';
    $('btnClearSaved').classList.remove('danger-text');
    saved = [];
    saveJSON(K.saved, saved);
    renderSaved();
    renderSettingsInfo();
    toast('Simpanan dibersihkan');
  });

  // Jaringan & pemasangan aplikasi
  window.addEventListener('online', renderSettingsInfo);
  window.addEventListener('offline', renderSettingsInfo);

  let deferred = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    $('btnInstall').hidden = false;
  });
  $('btnInstall').addEventListener('click', async () => {
    if (!deferred) { toast('Gunakan menu browser → Tambahkan ke layar utama'); return; }
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    $('btnInstall').hidden = true;
  });

  // Offset pencarian lengket mengikuti tinggi topbar
  const setStick = () => {
    const h = document.querySelector('.topbar').offsetHeight;
    document.documentElement.style.setProperty('--stick', h + 'px');
  };
  setStick();
  window.addEventListener('resize', setStick);
}

/* ---------------- Init ---------------- */
function init() {
  installNetworkGuard(); // lapis ke-2 dipasang sebelum permintaan apa pun
  applyTheme();
  wire();
  watchShield();
  updateShieldUI();
  renderSaved();
  renderSettingsInfo();
  switchView('home');

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
    let refreshed = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshed) return;
      refreshed = true;
      window.location.reload();
    });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
