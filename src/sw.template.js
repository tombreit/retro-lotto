// Service Worker (wird beim Build aus dieser Vorlage erzeugt).
// Seite: zuerst Netz (damit neue Ziehungen sofort ankommen), offline aus dem Cache.
// Gehashte Assets: zuerst Cache – sie ändern sich nie.

const CACHE = 'retro-lotto-__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([SHELL, ...PRECACHE]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      Promise.race([fetch(request), timeout(4000)])
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(SHELL, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(SHELL)) ?? Response.error()),
    );
    return;
  }

  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
});
