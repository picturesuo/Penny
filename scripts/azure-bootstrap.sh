#!/usr/bin/env bash
set -euo pipefail

REPO="${GITHUB_REPO:-picturesuo/Penny}"
RG="${AZURE_RESOURCE_GROUP:-penny-prod-rg}"
ACR_PREFIX="${AZURE_ACR_PREFIX:-pennyprodacr}"
PLAN_NAME="${AZURE_APP_SERVICE_PLAN:-penny-prod-plan}"
APP_PREFIX="${AZURE_WEBAPP_PREFIX:-penny-prod}"
PG_PREFIX="${AZURE_POSTGRES_PREFIX:-penny-prod-postgres}"
DB_NAME="${AZURE_DATABASE_NAME:-penny}"
DB_ADMIN="${AZURE_DATABASE_ADMIN:-pennyadmin}"
DOMAIN="${PENNY_DOMAIN:-mapenny.com}"

REGION_CANDIDATES=("$@")

if [[ ${#REGION_CANDIDATES[@]} -eq 0 ]]; then
  REGION_CANDIDATES=(
    westus3
    eastus2
    centralus
    westus2
    southcentralus
    northcentralus
    canadacentral
  )
fi

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command az
require_command gh
require_command openssl

SUBSCRIPTION_ID="$(az account show --query id --output tsv)"
if [[ -z "$SUBSCRIPTION_ID" ]]; then
  echo "Azure CLI is not logged in. Run az login or use Azure Cloud Shell." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not logged in. Run: gh auth login" >&2
  exit 1
fi

SUFFIX="${PENNY_DEPLOY_SUFFIX:-$(openssl rand -hex 3)}"
ACR_NAME="${AZURE_ACR_NAME:-$ACR_PREFIX$SUFFIX}"
PG_NAME="${AZURE_POSTGRES_NAME:-$PG_PREFIX-$SUFFIX}"
APP_NAME="${AZURE_WEBAPP_NAME:-$APP_PREFIX-$SUFFIX}"
DB_PASSWORD="${AZURE_DATABASE_PASSWORD:-$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 24)}"
PENNY_API_TOKEN="${PENNY_API_TOKEN:-$(openssl rand -hex 32)}"

echo "Using subscription: $SUBSCRIPTION_ID"
echo "Resource group: $RG"
echo "Container registry: $ACR_NAME"
echo "Postgres server: $PG_NAME"
echo "Web app: $APP_NAME"

az provider register --namespace Microsoft.Web --output none
az provider register --namespace Microsoft.ContainerRegistry --output none
az provider register --namespace Microsoft.DBforPostgreSQL --output none

RG_LOCATION="$(az group show --name "$RG" --query location --output tsv 2>/dev/null || true)"
if [[ -z "$RG_LOCATION" ]]; then
  RG_LOCATION="${REGION_CANDIDATES[0]}"
  az group create --name "$RG" --location "$RG_LOCATION" --output none
else
  echo "Resource group already exists in $RG_LOCATION."
fi

if ! az acr show --resource-group "$RG" --name "$ACR_NAME" >/dev/null 2>&1; then
  az acr create \
    --resource-group "$RG" \
    --name "$ACR_NAME" \
    --sku Basic \
    --admin-enabled true \
    --output none
else
  az acr update \
    --resource-group "$RG" \
    --name "$ACR_NAME" \
    --admin-enabled true \
    --output none
fi

PG_LOCATION=""
if az postgres flexible-server show --resource-group "$RG" --name "$PG_NAME" >/dev/null 2>&1; then
  PG_LOCATION="$(az postgres flexible-server show --resource-group "$RG" --name "$PG_NAME" --query location --output tsv)"
  echo "PostgreSQL server already exists in $PG_LOCATION. Resetting admin password to match App Service settings..."
  az postgres flexible-server update \
    --resource-group "$RG" \
    --name "$PG_NAME" \
    --admin-password "$DB_PASSWORD" \
    --output none
else
  for location in "${REGION_CANDIDATES[@]}"; do
    echo "Trying PostgreSQL Flexible Server in $location..."
    if az postgres flexible-server create \
      --resource-group "$RG" \
      --name "$PG_NAME" \
      --location "$location" \
      --sku-name Standard_B1ms \
      --tier Burstable \
      --storage-size 32 \
      --version 16 \
      --admin-user "$DB_ADMIN" \
      --admin-password "$DB_PASSWORD" \
      --yes \
      --output none; then
      PG_LOCATION="$location"
      break
    fi
  done
fi

if [[ -z "$PG_LOCATION" ]]; then
  echo "Could not create PostgreSQL in any candidate region: ${REGION_CANDIDATES[*]}" >&2
  echo "Run this to see allowed regions: az account list-locations --query \"[].name\" --output tsv" >&2
  exit 1
fi

az postgres flexible-server db create \
  --resource-group "$RG" \
  --server-name "$PG_NAME" \
  --database-name "$DB_NAME" \
  --output none || true

az postgres flexible-server firewall-rule create \
  --resource-group "$RG" \
  --name "$PG_NAME" \
  --rule-name allow-azure-services \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0 \
  --output none || true

if ! az appservice plan show --resource-group "$RG" --name "$PLAN_NAME" >/dev/null 2>&1; then
  az appservice plan create \
    --resource-group "$RG" \
    --name "$PLAN_NAME" \
    --location "$PG_LOCATION" \
    --is-linux \
    --sku B1 \
    --output none
fi

if ! az webapp show --resource-group "$RG" --name "$APP_NAME" >/dev/null 2>&1; then
  az webapp create \
    --resource-group "$RG" \
    --plan "$PLAN_NAME" \
    --name "$APP_NAME" \
    --deployment-container-image-name mcr.microsoft.com/appsvc/staticsite:latest \
    --output none
fi

az webapp config appsettings set \
  --resource-group "$RG" \
  --name "$APP_NAME" \
  --settings \
    NODE_ENV=production \
    PORT=3000 \
    WEBSITES_PORT=3000 \
    PENNY_AUTH_MODE=token \
    PENNY_API_TOKEN="$PENNY_API_TOKEN" \
    PENNY_AUTO_MIGRATE=true \
    PENNY_CORS_ORIGINS="https://$DOMAIN,https://www.$DOMAIN,https://$APP_NAME.azurewebsites.net" \
    DATABASE_URL="postgresql://$DB_ADMIN:$DB_PASSWORD@$PG_NAME.postgres.database.azure.com:5432/$DB_NAME?sslmode=require" \
  --output none

ACR_LOGIN_SERVER="$(az acr show --resource-group "$RG" --name "$ACR_NAME" --query loginServer --output tsv)"
ACR_USERNAME="$(az acr credential show --name "$ACR_NAME" --query username --output tsv)"
ACR_PASSWORD="$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" --output tsv)"

SP_NAME="penny-github-actions-$SUFFIX"
AZURE_CREDENTIALS="$(
  az ad sp create-for-rbac \
    --name "$SP_NAME" \
    --role contributor \
    --scopes "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG" \
    --json-auth \
    --output json
)"

gh secret set ACR_LOGIN_SERVER --repo "$REPO" --body "$ACR_LOGIN_SERVER"
gh secret set ACR_USERNAME --repo "$REPO" --body "$ACR_USERNAME"
gh secret set ACR_PASSWORD --repo "$REPO" --body "$ACR_PASSWORD"
gh secret set AZURE_CREDENTIALS --repo "$REPO" --body "$AZURE_CREDENTIALS"
gh secret set AZURE_RESOURCE_GROUP --repo "$REPO" --body "$RG"
gh secret set AZURE_WEBAPP_NAME --repo "$REPO" --body "$APP_NAME"

gh workflow run deploy-azure.yml --repo "$REPO" --ref main

echo
echo "Azure bootstrap complete."
echo "Temporary URL: https://$APP_NAME.azurewebsites.net"
echo "GitHub Actions deploy started: https://github.com/$REPO/actions/workflows/deploy-azure.yml"
echo "Postgres location used: $PG_LOCATION"
echo "Do not print or share the generated database password or PENNY_API_TOKEN."
