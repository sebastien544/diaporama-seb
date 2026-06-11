// Service Worker du diaporama : stratégie "cache-first" sur les images Pinterest.
// → une image déjà vue est servie depuis le cache (0 data) ; seules les nouvelles
//   images sont téléchargées. La sélection reste 100 % aléatoire côté page :
//   cette couche rend simplement les répétitions gratuites.

const CACHE = "pins-img-v1";       // change le suffixe pour forcer un nouveau cache
const IMG_HOST = "i.pinimg.com";   // hôte des images Pinterest
const MAX_ENTRIES = 200;           // filet de sécurité (~quelques dizaines de Mo) — ajustable

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith("pins-img") && k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // On ne gère QUE les images Pinterest ; tout le reste (HTML, pins.json) passe normalement.
  if (event.request.method !== "GET" || url.hostname !== IMG_HOST) return;
  event.respondWith(cacheFirst(event.request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;                         // déjà en cache → aucun téléchargement
  const response = await fetch(request);       // sinon on télécharge une fois
  // Ne pas figer une erreur en cache. Les images <img> cross-origin sont "opaque"
  // (statut invisible) : on les garde quand même, et l'éviction côté page
  // (evictFromCache, sur onerror d'affichage) répare les rares 404 mis en cache.
  if (response.ok || response.type === "opaque")
    cache.put(request, response.clone()).then(() => trim(cache)).catch(() => {});
  return response;
}

// Plafonne le nombre d'images gardées (évince les plus anciennes insérées).
async function trim(cache) {
  const keys = await cache.keys();
  const excess = keys.length - MAX_ENTRIES;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}
