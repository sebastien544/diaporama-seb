#!/bin/bash
# Déploie le Diaporama Pinterest (site statique nginx) sur Scaleway Serverless Containers.
# Prérequis : scw CLI configuré (scw init), docker démarré, jq installé.

set -e

# --- Config (surchargeable via variables d'env) ---
NAMESPACE_NAME="${NAMESPACE_NAME:-pinterest-diaporama}"
CONTAINER_NAME="${CONTAINER_NAME:-pinterest-diaporama}"
REGION="${REGION:-fr-par}"

UUID_RE='^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
if [ -z "$SCW_SECRET_KEY" ] || ! [[ "$SCW_SECRET_KEY" =~ $UUID_RE ]]; then
  echo "   SCW_SECRET_KEY invalide ou absente — fallback sur scw config"
  SCW_SECRET_KEY=$(scw config get secret-key)
fi
if ! [[ "$SCW_SECRET_KEY" =~ $UUID_RE ]]; then
  echo "❌ SCW_SECRET_KEY n'est pas un UUID valide. Vérifie 'scw config get secret-key'."
  exit 1
fi

echo "🚀 Déploiement du Diaporama Pinterest sur Scaleway"
echo "   Région: $REGION | Namespace: $NAMESPACE_NAME"

# --- 1. Container Registry namespace (créé si absent) ---
echo "📦 Container Registry…"
REGISTRY_ENDPOINT=$(scw registry namespace list region=$REGION -o json \
  | jq -r ".[] | select(.name==\"$NAMESPACE_NAME\") | .endpoint")
if [ -z "$REGISTRY_ENDPOINT" ]; then
  echo "   Création du namespace registry: $NAMESPACE_NAME"
  REGISTRY_ENDPOINT=$(scw registry namespace create name=$NAMESPACE_NAME region=$REGION -o json | jq -r '.endpoint')
fi
echo "   Registry: $REGISTRY_ENDPOINT"

# --- 2. Login Docker ---
echo "🔑 Login Docker…"
docker login $REGISTRY_ENDPOINT -u nologin --password-stdin <<< "$SCW_SECRET_KEY"

# --- 3. Build & push ---
IMAGE_TAG="$REGISTRY_ENDPOINT/$CONTAINER_NAME:latest"
echo "🔨 Build de l'image: $IMAGE_TAG"
docker build --platform linux/amd64 -t "$IMAGE_TAG" .
echo "📤 Push…"
docker push "$IMAGE_TAG"

# --- 4. Serverless Containers namespace (créé si absent) ---
echo "📦 Namespace Serverless Containers…"
CONTAINER_NAMESPACE_ID=$(scw container namespace list region=$REGION -o json \
  | jq -r ".[] | select(.name==\"$NAMESPACE_NAME\") | .id")
if [ -z "$CONTAINER_NAMESPACE_ID" ]; then
  echo "   Création du namespace: $NAMESPACE_NAME"
  CONTAINER_NAMESPACE_ID=$(scw container namespace create name=$NAMESPACE_NAME region=$REGION -o json | jq -r '.id')
  echo "   Attente que le namespace soit prêt…"
  for _ in $(seq 1 60); do
    NS_STATUS=$(scw container namespace get $CONTAINER_NAMESPACE_ID region=$REGION -o json | jq -r '.status')
    [ "$NS_STATUS" = "ready" ] && break
    [ "$NS_STATUS" = "error" ] && { echo "   ❌ Namespace en erreur"; exit 1; }
    sleep 3
  done
fi
echo "   Namespace ID: $CONTAINER_NAMESPACE_ID"

# --- 5. Création ou mise à jour du container ---
echo "🚢 Déploiement du container…"
EXISTING_CONTAINER_ID=$(scw container container list namespace-id=$CONTAINER_NAMESPACE_ID region=$REGION -o json \
  | jq -r ".[] | select(.name==\"$CONTAINER_NAME\") | .id")

if [ -z "$EXISTING_CONTAINER_ID" ]; then
  echo "   Création du container: $CONTAINER_NAME"
  CONTAINER_ID=$(scw container container create \
    namespace-id=$CONTAINER_NAMESPACE_ID \
    name=$CONTAINER_NAME \
    registry-image=$IMAGE_TAG \
    port=8080 \
    cpu-limit=140 \
    memory-limit=256 \
    min-scale=0 \
    max-scale=3 \
    privacy=public \
    protocol=http1 \
    region=$REGION \
    -o json | jq -r '.id')
else
  echo "   Mise à jour du container existant: $CONTAINER_NAME"
  CONTAINER_ID=$EXISTING_CONTAINER_ID
  scw container container update $CONTAINER_ID \
    registry-image=$IMAGE_TAG \
    region=$REGION > /dev/null
fi

# --- 6. Déploiement ---
echo "   Attente d'un état stable…"
for _ in $(seq 1 60); do
  C_STATUS=$(scw container container get $CONTAINER_ID region=$REGION -o json | jq -r '.status')
  { [ "$C_STATUS" = "ready" ] || [ "$C_STATUS" = "created" ]; } && break
  [ "$C_STATUS" = "error" ] && { echo "   ❌ Container en erreur"; exit 1; }
  sleep 3
done

echo "   Déploiement…"
scw container container deploy $CONTAINER_ID region=$REGION > /dev/null
echo "   Attente que le container soit prêt…"
for _ in $(seq 1 120); do
  C_STATUS=$(scw container container get $CONTAINER_ID region=$REGION -o json | jq -r '.status')
  [ "$C_STATUS" = "ready" ] && break
  [ "$C_STATUS" = "error" ] && { echo "   ❌ Container en erreur"; scw container container get $CONTAINER_ID region=$REGION -o json | jq -r '.error_message // "(pas de message)"'; exit 1; }
  sleep 3
done
echo "   Statut: $C_STATUS"

# --- 7. URL finale ---
CONTAINER_URL=$(scw container container get $CONTAINER_ID region=$REGION -o json | jq -r '.domain_name')
echo ""
echo "✅ Déploiement terminé !"
echo ""
echo "   🖼️  Diaporama : https://$CONTAINER_URL/"
echo ""
echo "👉 Ouvre cette URL dans Safari sur l'iPad, puis Partager → « Sur l'écran d'accueil »."
