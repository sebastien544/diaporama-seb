// Synchronise toutes les épingles d'un tableau Pinterest vers pins.json (via l'API officielle v5).
// Exécuté par la GitHub Action. Secrets requis :
//   PINTEREST_CLIENT_ID, PINTEREST_CLIENT_SECRET, PINTEREST_REFRESH_TOKEN
// Variables : BOARD_NAME (défaut "diaporama"), BOARD_USER (défaut "Pseba37"), BOARD_ID (optionnel).

import fs from "node:fs";

const API = "https://api.pinterest.com/v5";
const { PINTEREST_CLIENT_ID: CLIENT_ID, PINTEREST_CLIENT_SECRET: CLIENT_SECRET,
        PINTEREST_REFRESH_TOKEN: REFRESH_TOKEN } = process.env;
const BOARD_NAME = (process.env.BOARD_NAME || "diaporama").toLowerCase();
const BOARD_USER = process.env.BOARD_USER || "Pseba37";
const BOARD_ID = process.env.BOARD_ID || "";

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
  // Secrets pas encore configurés (app Pinterest en attente d'approbation) :
  // on ne fait rien et on sort en succès pour éviter les e-mails d'échec.
  console.log("⏭️  Secrets Pinterest absents → synchro ignorée pour l'instant.");
  process.exit(0);
}

async function getAccessToken() {
  const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: REFRESH_TOKEN }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`token ${r.status}: ${JSON.stringify(j)}`);
  if (j.refresh_token && j.refresh_token !== REFRESH_TOKEN) {
    console.warn("⚠️ Pinterest a renvoyé un NOUVEAU refresh token — pense à mettre à jour le secret PINTEREST_REFRESH_TOKEN si l'auth échoue plus tard.");
  }
  return j.access_token;
}

async function apiGet(path, token, params = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${await r.text()}`);
  return r.json();
}

async function findBoardId(token) {
  if (BOARD_ID) return BOARD_ID;
  let bookmark;
  do {
    const data = await apiGet("/boards", token, { page_size: 100, bookmark });
    for (const b of data.items || []) {
      if ((b.name || "").toLowerCase() === BOARD_NAME) return b.id;
    }
    bookmark = data.bookmark;
  } while (bookmark);
  throw new Error(`Tableau "${BOARD_NAME}" introuvable parmi tes tableaux.`);
}

// Choisit l'image la plus grande disponible pour une épingle.
function bestImage(pin) {
  const m = pin.media;
  if (!m) return null;
  if (m.images && typeof m.images === "object") {
    let best = null;
    for (const img of Object.values(m.images)) {
      if (img && img.url && (!best || (img.width || 0) > (best.width || 0))) best = img;
    }
    if (best && best.url) return best.url;
  }
  if (m.cover_image_url) return m.cover_image_url;   // épingles vidéo
  return null;
}

async function allPins(boardId, token) {
  const out = [];
  let bookmark;
  do {
    const data = await apiGet(`/boards/${boardId}/pins`, token, { page_size: 100, bookmark });
    for (const pin of data.items || []) {
      const url = bestImage(pin);
      if (url) out.push({ url, link: `https://www.pinterest.com/pin/${pin.id}/`, title: pin.title || "" });
    }
    bookmark = data.bookmark;
  } while (bookmark);
  return out;
}

try {
  const token = await getAccessToken();
  const boardId = await findBoardId(token);
  const images = await allPins(boardId, token);
  const data = {
    board: `${BOARD_USER}/${BOARD_NAME}`,
    board_id: boardId,
    generated_at: new Date().toISOString(),
    count: images.length,
    images,
  };
  fs.writeFileSync("pins.json", JSON.stringify(data, null, 2) + "\n");
  console.log(`✅ ${images.length} épingles écrites dans pins.json (board ${boardId}).`);
} catch (e) {
  console.error("❌", e.message);
  process.exit(1);
}
