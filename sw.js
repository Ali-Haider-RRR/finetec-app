// Service worker: caches the whole app so it works with no internet.
const CACHE = 'finetec-v16';
const FILES = [
  './', './index.html', './manifest.webmanifest',
  './css/app.css',
  './js/app.js', './js/db.js', './js/render.js', './js/pdf.js', './js/words.js', './js/sigpad.js',
  './assets/logo.png', './assets/ft.png',
  './assets/bg-pool-light.jpg', './assets/bg-pool-mid.jpg',
  './assets/fonts/LiberationSans-Regular.ttf', './assets/fonts/LiberationSans-Bold.ttf',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/products/sand-filter.png', './assets/products/pool-pump.png', './assets/products/skimmer.png',
  './assets/products/heater.png', './assets/products/ladder.png', './assets/products/maintenance-kit.png',
  './assets/products/drain-led.png', './assets/products/valve.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
// Network-first: online = always the newest version; offline = the saved copy.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(res => {
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() =>
      caches.match(e.request, { ignoreSearch: true }).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('./index.html') : undefined))
    )
  );
});
