// Service Worker du diaporama : stratégie "cache-first" sur les images.
// → une image déjà vue est servie depuis le cache (0 data) ; seules les nouvelles
//   images sont téléchargées. La sélection reste 100 % aléatoire côté page :
//   cette couche rend simplement les répétitions gratuites.
// Deux caches séparés :
//   - PINS_CACHE : images Pinterest (i.pinimg.com), URL immuables après upscale.
//   - NEWS_CACHE : images d'actu (éditeurs, LoremFlickr, Picsum…), URL elles aussi
//     immuables (image d'article fixe, ?lock= / seed déterministes). Utile car le
//     panneau d'actu boucle et se rafraîchit toutes les 30 min → répétitions gratuites.

const PINS_CACHE = "pins-img-v1";  // change le suffixe pour forcer un nouveau cache
const NEWS_CACHE = "news-img-v1";
const KEEP = [PINS_CACHE, NEWS_CACHE];
const IMG_HOST = "i.pinimg.com";   // hôte des images Pinterest
const PINS_MAX = 200;              // filet de sécurité (~quelques dizaines de Mo) — ajustable
const NEWS_MAX = 150;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // Purge les anciens caches d'images (préfixe pins-img / news-img) hors versions courantes.
        keys.filter((k) => /^(pins-img|news-img)/.test(k) && !KEEP.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Images Pinterest → cache dédié.
  if (url.hostname === IMG_HOST) { event.respondWith(cacheFirst(req, PINS_CACHE, PINS_MAX)); return; }
  // Images d'actu : tout <img> cross-origin (éditeurs, LoremFlickr, Picsum, favicons…).
  // Le reste (HTML, pins.json, assets même origine) passe normalement.
  if (req.destination === "image" && url.origin !== self.location.origin)
    event.respondWith(cacheFirst(req, NEWS_CACHE, NEWS_MAX));
});

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;                         // déjà en cache → aucun téléchargement
  const response = await fetch(request);       // sinon on télécharge une fois
  // Ne pas figer une erreur en cache. Les images <img> cross-origin sont "opaque"
  // (statut invisible) : on les garde quand même, et l'éviction côté page
  // (evictFromCache, sur onerror d'affichage) répare les rares 404 mis en cache.
  if (response.ok || response.type === "opaque")
    cache.put(request, response.clone()).then(() => trim(cache, max)).catch(() => {});
  return response;
}

// Plafonne le nombre d'images gardées (évince les plus anciennes insérées).
async function trim(cache, max) {
  const keys = await cache.keys();
  const excess = keys.length - max;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}
