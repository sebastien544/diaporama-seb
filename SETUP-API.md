# Brancher l'API officielle Pinterest (à faire une fois l'app approuvée)

Tant que l'app Pinterest est en *Trial access pending*, rien à faire : la synchro est
en veille (elle ne plante pas). Dès réception de l'**App ID** + **App secret** :

## 1. Récupérer le refresh token (une seule fois, en local)

Vérifie que `http://localhost:8085/` est bien dans les *Redirect URIs* de l'app, puis :

```bash
cd ~/Bureau/mes-apps/pinterest-diaporama
export PINTEREST_CLIENT_ID="<App ID>"
export PINTEREST_CLIENT_SECRET="<App secret>"
node auth.mjs
```

Une page Pinterest s'ouvre → connecte-toi avec le compte qui possède le tableau et autorise.
Le **refresh token** s'affiche dans le terminal : copie-le.

## 2. Enregistrer les secrets GitHub

Pour que les valeurs ne transitent pas par le chat, lance ces commandes toi-même
(préfixe `!` dans Claude Code, ou ton terminal) — elles demandent la valeur de façon masquée :

```bash
gh secret set PINTEREST_CLIENT_ID --repo sebastien544/diaporama-seb
gh secret set PINTEREST_CLIENT_SECRET --repo sebastien544/diaporama-seb
gh secret set PINTEREST_REFRESH_TOKEN --repo sebastien544/diaporama-seb
```

## 3. Lancer la première synchro

```bash
gh workflow run "Sync Pinterest board" --repo sebastien544/diaporama-seb
```

(ou attends le passage automatique, toutes les 6 h). La synchro :
1. rafraîchit un access token à partir du refresh token,
2. trouve le tableau `diaporama`,
3. **pagine toutes les épingles** et écrit `pins.json`,
4. le commite → GitHub Pages se met à jour.

## 4. C'est tout

Le diaporama lit automatiquement `pins.json` (toutes les épingles, haute résolution,
sans proxy). Il garde le **repli RSS** pour n'importe quel autre tableau public tapé à la main.

---

### Réglages
- Fréquence de synchro : `cron` dans `.github/workflows/sync.yml`.
- Autre tableau : variables `BOARD_NAME` / `BOARD_USER` (ou `BOARD_ID`) dans le workflow.
- Tableau privé : ajouter les scopes `boards:read_secret,pins:read_secret` dans `auth.mjs`
  (⚠️ ne pas exposer un `pins.json` privé sur un dépôt public).
- Le refresh token Pinterest dure ~1 an → re-jouer l'étape 1 une fois par an.
