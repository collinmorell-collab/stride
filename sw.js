// ============================================================
// sw.js: the "service worker".
//
// A service worker is a small helper script the browser keeps running
// in the background for this app. Ours keeps a copy of every app file
// on your phone, so Stride opens instantly and works with no signal.
//
// Strategy ("stale-while-revalidate"): show the saved copy right away,
// then quietly fetch a fresh copy for next time.
// ============================================================

const CACHE = 'stride-v5';

const CORE = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/store.js',
  'js/content.js',
  'js/session.js',
  'js/speech.js',
  'js/ui.js',
  'js/decode.js',
  'js/news.js',
  'content/curriculum.json',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's own short-term cache so we save the newest files.
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((url) => new Request(url, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Delete caches from older versions of the app.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle our own files. Calls to Anthropic etc. go straight to the internet.
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // The news feed changes daily, so try the internet first and only
  // fall back to the saved copy when offline.
  if (req.url.includes('/content/feed/')) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        fetch(req, { cache: 'no-cache' })
          .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
          .catch(() => cache.match(req, { ignoreSearch: true })))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const saved = await cache.match(req, { ignoreSearch: true });
      // 'no-cache' = always double-check with the server, so updates arrive by the next open.
      const fresh = fetch(req, { cache: 'no-cache' })
        .then((res) => { if (res.ok) cache.put(req, res.clone()); return res; })
        .catch(() => saved);
      return saved || fresh;
    })
  );
});
