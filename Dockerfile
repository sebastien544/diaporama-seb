# Conteneur statique minimal : nginx sert index.html
FROM nginx:alpine

# La page de l'app
COPY index.html /usr/share/nginx/html/index.html

# Config nginx générée au démarrage depuis le template (écoute sur $PORT).
# L'entrypoint officiel nginx applique envsubst uniquement aux variables
# d'environnement définies → $uri n'est PAS substitué.
COPY default.conf.template /etc/nginx/templates/default.conf.template

# Scaleway Serverless Containers fournit $PORT (8080 par défaut)
ENV PORT=8080
EXPOSE 8080
