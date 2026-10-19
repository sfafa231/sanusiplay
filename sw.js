/* SanusiPlay — service worker: simpan-while-revalidate agar bisa dibuka luring
   + PENCEGAT IKLAN (lapis ke-3): permintaan ke domain iklan diputus total. */
const CACHE = 'sanusiplay-v1.1.0';
const AD_PATTERN = /doubleclick|googlesyndication|googleadservices|pagead|adservice|adnxs|adsystem|adtech|taboola|outbrain|criteo|pubmatic|rubiconproject|openx|smartadserver|adform|moatads|scorecardresearch|quantserve|hotjar|facebook\.net|googletagmanager|google-analytics|adsrvr|adcolony|unityads|applovin|inmobi|vungle/i;
const ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // LAPIS 3 — PENCEGAT IKLAN: putus permintaan ke domain iklan/pelacak
  if (AD_PATTERN.test(url.href)) {
    e.respondWith(new Response('', { status: 204, statusText: 'Blocked by Perisai Mutlak Sanusi' }));
    return;
  }

  // Data video langsung dari jaringan (jangan pernah di-cache — URL stream kedaluwarsa)
  if (url.origin !== self.location.origin) return;

  // Navigasi: coba jaringan dulu, jatuh ke cache saat luring
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return r;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  // Aset lain: sajikan dari cache lebih dulu, perbarui diam-diam
  e.respondWith(
    caches.match(req).then(hit => {
      const fresh = fetch(req).then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return r;
      }).catch(() => hit);
      return hit || fresh;
    })
  );
});
