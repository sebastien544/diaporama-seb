// Synchronise TOUTES les épingles d'un tableau Pinterest vers pins.json.
//
// N'utilise PAS l'API officielle v5 (accès refusé par Pinterest, et de toute façon
// ses conditions interdisent de stocker les données). On interroge à la place les
// endpoints internes que le site pinterest.com utilise lui-même pour s'afficher :
//   - BoardResource     → id + nombre d'épingles du tableau
//   - BoardFeedResource → les épingles, paginées via un système de « bookmarks »
// Aucun token, aucune authentification. Tourne côté serveur (GitHub Action) → pas de
// problème CORS, donc plus besoin des proxys publics instables du front-end.
//
// ⚠️ Endpoints non officiels : si Pinterest change leur format, la synchro casse
// (le site continue d'afficher le dernier pins.json en attendant). Zone grise vis-à-vis
// des CGU, comme l'était déjà le scraping du flux RSS — mais ici sur tout le tableau.
//
// Variables : BOARD_USER (défaut "Pseba37"), BOARD_NAME / slug (défaut "diaporama").

import fs from "node:fs";

const BOARD_USER = process.env.BOARD_USER || "Pseba37";
const BOARD_SLUG = (process.env.BOARD_NAME || "diaporama").toLowerCase();
const SOURCE_URL = `/${BOARD_USER}/${BOARD_SLUG}/`;

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json, text/javascript, */*; q=0.01",
  "X-Requested-With": "XMLHttpRequest",
  "X-Pinterest-PWS-Handler": "www/[username]/[slug].js",
  "Referer": `https://www.pinterest.com${SOURCE_URL}`,
};

// Appelle un endpoint interne `/resource/<name>/get/` avec les options données.
// Réessaie quelques fois (les blips réseau / 429 ponctuels sont fréquents).
async function resource(name, options) {
  const data = JSON.stringify({ options, context: {} });
  const url = `https://www.pinterest.com/resource/${name}/get/`
            + `?source_url=${encodeURIComponent(SOURCE_URL)}&data=${encodeURIComponent(data)}`;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      const rr = j.resource_response || {};
      if (rr.status && rr.status !== "success")
        throw new Error(`statut ${rr.status}: ${rr.message || ""}`);
      return rr;
    } catch (e) {
      lastErr = e;
      await new Promise(res => setTimeout(res, 800 * (attempt + 1)));
    }
  }
  throw new Error(`${name} a échoué après 4 tentatives : ${lastErr && lastErr.message}`);
}

// Récupère l'id du tableau (et son nombre d'épignes, pour le log) depuis user/slug.
async function getBoard() {
  const rr = await resource("BoardResource", { username: BOARD_USER, slug: BOARD_SLUG });
  const b = rr.data;
  if (!b || !b.id) throw new Error(`Tableau ${SOURCE_URL} introuvable.`);
  return { id: b.id, name: b.name || BOARD_SLUG, pinCount: b.pin_count || 0 };
}

// URL de l'image en meilleure résolution (orig, sinon 736x, sinon la plus large).
function bestImage(pin) {
  const imgs = pin && pin.images;
  if (!imgs || typeof imgs !== "object") return null;
  if (imgs.orig && imgs.orig.url) return imgs.orig.url;
  let best = null;
  for (const img of Object.values(imgs)) {
    if (img && img.url && (!best || (img.width || 0) > (best.width || 0))) best = img;
  }
  return best && best.url ? best.url : null;
}

// Parcourt toutes les pages du tableau via les bookmarks.
async function allPins(boardId) {
  const out = [];
  const seenUrl = new Set();
  let bookmark = "";
  let prev = null;
  for (let page = 0; page < 100; page++) {   // garde-fou anti-boucle infinie
    const rr = await resource("BoardFeedResource",
      { board_id: boardId, page_size: 25, bookmarks: [bookmark] });
    const items = Array.isArray(rr.data) ? rr.data : [];
    for (const pin of items) {
      const url = bestImage(pin);
      if (!url || seenUrl.has(url)) continue;
      seenUrl.add(url);
      out.push({
        url,
        link: pin.id ? `https://www.pinterest.com/pin/${pin.id}/` : "",
        title: pin.title || pin.grid_title || "",
      });
    }
    bookmark = rr.bookmark || "";
    // Fin de pagination : Pinterest renvoie "-end-", un bookmark vide, ou se répète.
    if (!bookmark || bookmark === "-end-" || bookmark === prev) break;
    prev = bookmark;
  }
  return out;
}

try {
  const board = await getBoard();
  const images = await allPins(board.id);
  if (!images.length) throw new Error("aucune épingle récupérée (format de l'endpoint changé ?).");
  const data = {
    board: `${BOARD_USER}/${BOARD_SLUG}`,
    board_id: board.id,
    generated_at: new Date().toISOString(),
    count: images.length,
    images,
  };
  fs.writeFileSync("pins.json", JSON.stringify(data, null, 2) + "\n");
  console.log(`✅ ${images.length} épingles écrites dans pins.json (board ${board.id}, ${board.pinCount} annoncées).`);
} catch (e) {
  console.error("❌", e.message);
  process.exit(1);
}
