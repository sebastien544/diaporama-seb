// Récupération unique du "refresh token" Pinterest (à lancer en local une seule fois).
//
//   export PINTEREST_CLIENT_ID=<App ID>
//   export PINTEREST_CLIENT_SECRET=<App secret>
//   node auth.mjs
//
// Une page Pinterest s'ouvre → tu te connectes (compte qui possède le tableau) et tu autorises.
// Le refresh token s'affiche dans le terminal : à enregistrer comme secret GitHub.

import http from "node:http";
import { exec } from "node:child_process";

const CLIENT_ID = process.env.PINTEREST_CLIENT_ID;
const CLIENT_SECRET = process.env.PINTEREST_CLIENT_SECRET;
const REDIRECT = "http://localhost:8085/";          // doit correspondre EXACTEMENT à l'app Pinterest
const SCOPES = "boards:read,pins:read";              // + boards:read_secret,pins:read_secret pour le privé

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Exporte d'abord :\n  export PINTEREST_CLIENT_ID=...\n  export PINTEREST_CLIENT_SECRET=...");
  process.exit(1);
}

const state = Math.random().toString(36).slice(2);
const authUrl = "https://www.pinterest.com/oauth/?" + new URLSearchParams({
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT,
  response_type: "code",
  scope: SCOPES,
  state,
}).toString();

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== "/") { res.writeHead(404); res.end(); return; }
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  if (err) { res.writeHead(400); res.end("Erreur Pinterest : " + err); console.error("❌", err); process.exit(1); }
  if (!code) { res.writeHead(400); res.end("Pas de code dans la redirection."); return; }
  try {
    const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64");
    const r = await fetch("https://api.pinterest.com/v5/oauth/token", {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: REDIRECT }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(j));
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h2>✅ C'est bon ! Reviens au terminal, tu peux fermer cet onglet.</h2>");
    console.log("\n========================= REFRESH TOKEN =========================\n");
    console.log(j.refresh_token);
    console.log("\n=================================================================");
    console.log(`access_token valable ~${j.expires_in}s | refresh_token valable ~${j.refresh_token_expires_in}s`);
    console.log("scopes :", j.scope);
    console.log("\n👉 Enregistre-le comme secret GitHub : PINTEREST_REFRESH_TOKEN");
    setTimeout(() => process.exit(0), 300);
  } catch (e) {
    res.writeHead(500); res.end("Échec de l'échange du token : " + e.message);
    console.error("❌ Échange du token :", e.message); process.exit(1);
  }
});

server.listen(8085, () => {
  console.log("\nOuvre cette URL (connecté au compte Pinterest qui possède le tableau) :\n");
  console.log(authUrl + "\n");
  exec(`xdg-open "${authUrl}"`, () => {});   // tentative d'ouverture automatique
});
