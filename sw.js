// Service Worker du diaporama.
//   - SHELL_CACHE : coquille de l'app (index.html, manifest, icônes) en network-first
//     → l'app se met à jour quand elle est en ligne ET se recharge hors-ligne.
//   - PINS_CACHE  : images Pinterest (i.pinimg.com), URL immuables après upscale.
//   - NEWS_CACHE  : images d'actu (éditeurs, LoremFlickr, Picsum…), URL elles aussi
//     immuables (image d'article fixe, ?lock= / seed déterministes). Utile car le
//     panneau d'actu boucle et se rafraîchit toutes les 30 min → répétitions gratuites.
// Les deux caches d'images sont en cache-first (une image déjà vue = 0 data).

const SHELL_CACHE = "shell-v1";
const PINS_CACHE = "pins-img-v1";  // change le suffixe pour forcer un nouveau cache
const NEWS_CACHE = "news-img-v1";
const KEEP = [SHELL_CACHE, PINS_CACHE, NEWS_CACHE];
const IMG_HOST = "i.pinimg.com";   // hôte des images Pinterest
const PINS_MAX = 200;              // filet de sécurité (~quelques dizaines de Mo) — ajustable
const NEWS_MAX = 150;

// Coquille à précacher (chemins relatifs au scope du SW). "./" et "index.html"
// servent de repli de navigation hors-ligne.
const SHELL = ["./", "index.html", "manifest.webmanifest", "icon.svg", "icon.png", "privacy.html"];
const SHELL_FILES = new Set(["", "index.html", "manifest.webmanifest", "icon.svg", "icon.png", "privacy.html"]);

self.addEventListener("install", (event) => {
  self.skipWaiting();
  // Cache résilient : un asset manquant n'empêche pas de cacher les autres.
  event.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    await Promise.allSettled(SHELL.map((u) => c.add(u)));
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // Purge nos anciens caches (shell / pins-img / news-img) hors versions courantes.
        // Préfixe ciblé : sur github.io, d'autres projets partagent l'origine.
        keys.filter((k) => /^(shell|pins-img|news-img)/.test(k) && !KEEP.includes(k)).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Même origine : coquille (navigation + assets statiques) en network-first ; le
  // reste (pins.json en no-store, etc.) passe normalement au réseau.
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate" || SHELL_FILES.has(url.pathname.split("/").pop()))
      event.respondWith(networkFirst(req));
    return;
  }
  // Images Pinterest → cache dédié.
  if (url.hostname === IMG_HOST) { event.respondWith(cacheFirst(req, PINS_CACHE, PINS_MAX)); return; }
  // Images d'actu : tout <img> cross-origin (éditeurs, LoremFlickr, Picsum, favicons…).
  if (req.destination === "image") event.respondWith(cacheFirst(req, NEWS_CACHE, NEWS_MAX));
});

// Network-first : réseau d'abord (donc à jour en ligne), repli cache si hors-ligne.
async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (e) {
    return (await cache.match(request))
        || (await cache.match("index.html"))
        || (await cache.match("./"))
        || Response.error();
  }
}

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
