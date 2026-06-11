// Proxy CORS pour le Diaporama Pinterest — à déployer sur Cloudflare Workers (gratuit).
//
// POURQUOI : un navigateur ne peut pas lire un flux RSS Pinterest directement
// (pas d'en-tête CORS sur i.pinimg.com / pinterest.com). Les proxys publics
// gratuits (codetabs, allorigins…) sont gratuits mais tombent souvent, tous en
// même temps. Ce Worker te donne TON proxy fiable : 100 000 requêtes/jour
// gratuites, largement assez pour un diaporama.
//
// DÉPLOIEMENT (2 minutes, sans rien installer) :
//   1. Crée un compte gratuit sur https://dash.cloudflare.com
//   2. Workers & Pages → Create → Worker → donne-lui un nom (ex. "pin-rss") → Deploy
//   3. Clique « Edit code », colle TOUT ce fichier à la place de l'exemple, puis Deploy
//   4. Copie l'URL du Worker (ex. https://pin-rss.toncompte.workers.dev)
//   5. Dans index.html, mets :  const SELF_PROXY = "https://pin-rss.toncompte.workers.dev/?url=";
//   6. Commit + push → GitHub Pages se met à jour, et le diaporama vise ton proxy en priorité.
//
// SÉCURITÉ : ce Worker ne relaie QU'une liste blanche d'hôtes (Pinterest, images
// pinimg, et les flux RSS du mode actu — voir ALLOWED), pour qu'il ne serve pas
// de proxy ouvert à tout Internet.

// Hôtes relayés : Pinterest (RSS + images) ET les flux du mode actu. Sans les
// domaines d'actu, ce Worker placé en tête de cascade rejetterait 20minutes,
// lemonde, news.google… en 403 (un aller-retour perdu par flux).
const ALLOWED = [
  /(^|\.)pinterest\.[a-z.]+$/i, /(^|\.)pinimg\.com$/i,
  /(^|\.)news\.google\.com$/i, /(^|\.)20minutes\.fr$/i, /(^|\.)lemonde\.fr$/i,
  /(^|\.)allocine\.fr$/i, /(^|\.)lesnumeriques\.com$/i, /(^|\.)francetvinfo\.fr$/i,
  /(^|\.)journalducoin\.com$/i, /(^|\.)lesechos\.fr$/i,
];

export default {
  async fetch(request) {
    const here = new URL(request.url);
    const target = here.searchParams.get("url");

    // Réponse au pré-vol CORS du navigateur.
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }));

    if (!target) return cors(new Response("usage : ?url=<flux RSS Pinterest>", { status: 400 }));

    let dest;
    try { dest = new URL(target); } catch { return cors(new Response("URL invalide", { status: 400 })); }
    if (!ALLOWED.some(re => re.test(dest.hostname)))
      return cors(new Response("domaine non autorisé", { status: 403 }));

    try {
      const upstream = await fetch(dest.toString(), {
        headers: { "User-Agent": "Mozilla/5.0 (diaporama-pinterest)", "Accept": "*/*" },
        cf: { cacheTtl: 600, cacheEverything: true },   // cache 10 min côté Cloudflare
      });
      const body = await upstream.arrayBuffer();
      const res = new Response(body, { status: upstream.status });
      const ct = upstream.headers.get("content-type");
      if (ct) res.headers.set("content-type", ct);
      return cors(res);
    } catch (e) {
      return cors(new Response("échec amont : " + (e && e.message), { status: 502 }));
    }
  },
};

function cors(res) {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "*");
  return res;
}
