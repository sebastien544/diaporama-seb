# Synchronisation du tableau Pinterest

> Historique : on a tenté d'utiliser l'**API officielle Pinterest v5**, mais l'accès a été
> **refusé** (juin 2026), et ses conditions interdisent de toute façon de **stocker** les
> données renvoyées (or l'app a besoin de `pins.json`). Cette voie est donc abandonnée.

## Comment ça marche aujourd'hui

`sync.mjs` récupère **toutes** les épingles du tableau via les **endpoints internes** que
le site pinterest.com utilise lui-même pour s'afficher — **sans clé ni authentification** :

1. `BoardResource` → id du tableau (depuis `BOARD_USER` / `BOARD_NAME`).
2. `BoardFeedResource` → les épingles, page par page via des « bookmarks », jusqu'au bout.
3. On garde l'image en pleine résolution (`orig`) et on écrit `pins.json`.

Le front-end lit `pins.json` et **tire les épingles au hasard** (shuffle déjà en place).
Les images `i.pinimg.com` se chargent en direct (CDN) → **aucun proxy** dans la chaîne.

## Automatisation

`.github/workflows/sync.yml` lance `node sync.mjs` **toutes les 6 h** (et via le bouton
« Run workflow »). Tournant côté serveur, il n'a **aucun problème CORS** et **aucun secret**
à configurer. Il committe `pins.json` quand le contenu change → GitHub Pages se met à jour.

Lancer une synchro à la main :
```bash
gh workflow run "Sync Pinterest board" --repo sebastien544/diaporama-seb
# ou en local :
BOARD_USER=Pseba37 BOARD_NAME=diaporama node sync.mjs
```

## Réglages

- **Autre tableau** : variables `BOARD_USER` / `BOARD_NAME` (le slug d'URL, en minuscules)
  dans le workflow.
- **Fréquence** : le `cron` dans `.github/workflows/sync.yml`.
- **Repli** : si `pins.json` est absent, le front-end retombe sur le flux RSS public du
  tableau (≈ 25 dernières épingles seulement) via des proxys CORS publics.

## ⚠️ Limite à connaître

Ces endpoints sont **non officiels** : si Pinterest change leur format, `sync.mjs` cessera de
mettre `pins.json` à jour (le site continue d'afficher la dernière version récupérée). Si ça
arrive, il faudra ré-inspecter les requêtes du site pinterest.com et adapter `sync.mjs`.

> Les secrets GitHub `PINTEREST_*` éventuellement posés ne servent plus et peuvent être
> supprimés : `gh secret delete PINTEREST_ACCESS_TOKEN --repo sebastien544/diaporama-seb`.
