// Service Worker: macht das Spiel offline spielbar.
// Strategie: beim Installieren alles holen, danach Cache zuerst und im
// Hintergrund aktualisieren. Bei jedem Release CACHE hochzählen.

const CACHE = 'potato-dungeons-v3.0.0';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css?v=300',
  './src/main.js?v=300',
  './src/core/math.js',
  './src/core/rng.js',
  './src/core/storage.js',
  './src/core/audio.js',
  './src/core/input.js',
  './src/core/sprites.js',
  './src/core/fx.js',
  './src/data/weapons.js',
  './src/data/enchants.js',
  './src/data/artifacts.js',
  './src/data/items.js',
  './src/data/enemies.js',
  './src/data/biomes.js',
  './src/data/characters.js',
  './src/game/entities.js',
  './src/game/state.js',
  './src/game/dungeon.js',
  './src/game/combat.js',
  './src/game/ai.js',
  './src/game/loot.js',
  './src/game/run.js',
  './src/ui/dom.js',
  './src/ui/cards.js',
  './src/ui/hud.js',
  './src/ui/camp.js',
  './src/ui/screens.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll bricht ab, wenn eine Datei fehlt — deshalb einzeln.
      .then((c) => Promise.all(ASSETS.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Schriften o. Ä. normal laden

  e.respondWith(
    caches.match(req, { ignoreSearch: false }).then((hit) => {
      const fetching = fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => hit);
      return hit || fetching;
    }),
  );
});
