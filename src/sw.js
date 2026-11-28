// Service Worker. Wird beim Build gebündelt (vite.config.js) und bekommt dabei die Precache-Liste
// und eine Version eingesetzt: __VERSION__ und __PRECACHE__ sind freie Bezeichner, keine Strings.
//
// Caching – Seite: zuerst Netz (damit neue Ziehungen sofort ankommen), offline aus dem Cache.
// Gehashte Assets: zuerst Cache – sie ändern sich nie.
//
// Mitspielen – nach einer Ziehung wertet der Worker die Scheine im Hintergrund aus und meldet das
// Ergebnis. Geweckt wird er per Periodic Background Sync (Chromium, installierte App). Er darf
// nie src/data.js importieren: Das würde die kompletten Ziehungsdaten in diese Datei ziehen.

import { GAMES } from './games.js';
import { kvGet, settleAll } from './lib/ticket-db.js';
import { announcement, resultsByDraw } from './lib/tickets.js';

const CACHE = 'retro-lotto-' + __VERSION__;
const PRECACHE = __PRECACHE__;
const SHELL = new URL('./', self.location).href;
/** Die jüngsten Ziehungen, ungehasht – die gehashten Daten-Chunks der Seite kennt der Worker nicht. */
const LATEST = new URL('./draws-latest.json', self.location).href;

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
  // Immer frisch aus dem Netz, nie aus dem Cache.
  if (request.url.split('?')[0] === LATEST) return;

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

// ---------------------------------------------------------------- Mitspielen

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-draws') event.waitUntil(checkDraws());
});

// Die Seite kann dieselbe Prüfung anstoßen – zum Testen und als Einstieg für späteren Web Push.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'check-draws') event.waitUntil(checkDraws());
});

async function checkDraws() {
  // Erst laden, dann in einer einzigen Transaktion auswerten.
  const response = await fetch(LATEST, { cache: 'no-store' });
  if (!response.ok) return;
  const { draws } = await response.json();
  const { tickets, fresh } = await settleAll(draws);
  if (fresh.length === 0) return;

  const windows = await ownWindows();
  for (const client of windows) client.postMessage({ type: 'tickets-changed' });
  // Ist die App gerade zu sehen, zeigt sie das Ergebnis selbst.
  if (windows.some((client) => client.visibilityState === 'visible')) return;
  if (self.Notification?.permission !== 'granted' || (await kvGet('notify')) === false) return;

  const announced = new Set(fresh.map(({ ticket, result }) => `${ticket.gameId}/${result.date}`));
  let waiting = 0;
  for (const game of Object.values(GAMES)) {
    for (const group of resultsByDraw(tickets, game.id)) {
      if (!group.seen) waiting++;
      if (!announced.has(`${game.id}/${group.date}`)) continue;
      const { title, body } = announcement(game, group);
      await self.registration.showNotification(title, {
        body,
        tag: `${game.id}-${group.date}`,
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-96.png',
        data: { gameId: game.id },
      });
    }
  }
  await navigator.setAppBadge?.(waiting).catch(() => {});
}

/** Fenster dieser App – unter github.io teilen sich mehrere Projekte denselben Origin. */
async function ownWindows() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return windows.filter((client) => client.url.startsWith(self.registration.scope));
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = `#${event.notification.data?.gameId ?? 'lotto'}/spielen`;
  event.waitUntil(
    ownWindows().then(([client]) => {
      // Ein offenes Fenster wechselt selbst zur Ansicht (Hash-Routing), sonst öffnet sich die App dort.
      if (!client) return self.clients.openWindow(`${self.registration.scope}?aufdecken${hash}`);
      client.postMessage({ type: 'open', hash, reveal: true });
      return client.focus();
    }),
  );
});
