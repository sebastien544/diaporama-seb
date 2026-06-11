# Conteneur statique minimal : nginx sert l'app
FROM nginx:alpine

# Tous les fichiers servis : la page, le service worker (cache images), les épingles
# synchronisées (sinon l'app retombe sur les proxys RSS instables), les icônes et
# la page de confidentialité. Sans pins.json/sw.js, l'image était inutilisable.
COPY index.html sw.js pins.json privacy.html icon.png icon.svg /usr/share/nginx/html/

# Config nginx générée au démarrage depuis le template (écoute sur $PORT).
# L'entrypoint officiel nginx applique envsubst uniquement aux variables
# d'environnement définies → $uri n'est PAS substitué.
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Scaleway Serverless Containers fournit $PORT (8080 par défaut)
ENV PORT=8080
EXPOSE 8080
