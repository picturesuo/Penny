# Azure Deployment Runbook

## Target Architecture

- Azure App Service for Containers runs the Penny Node server.
- Azure Database for PostgreSQL Flexible Server stores Penny state.
- `mapenny.com` and `www.mapenny.com` point to the App Service custom domain.
- Runtime secrets live in Azure App Service application settings, not in repo files.

## Azure Resources

Create these in the same region, for example `eastus`:

- Resource group: `penny-prod-rg`
- Container registry: `pennyprodacr`
- PostgreSQL Flexible Server: `penny-prod-postgres`
- App Service plan: Linux, Basic or Premium v3
- Web App for Containers: `penny-prod`

## Required App Settings

Set these on the web app:

```text
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://<user>:<password>@<postgres-host>:5432/postgres?sslmode=require
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<long-random-token>
PENNY_CORS_ORIGINS=https://mapenny.com,https://www.mapenny.com
PENNY_AUTO_MIGRATE=true
```

Optional provider settings:

```text
XAI_API_KEY=<secret>
XAI_MODEL=<model>
XAI_BASE_URL=https://api.x.ai/v1
ANTHROPIC_API_KEY=<secret>
```

## First Deploy

From an authenticated Azure CLI session:

```sh
az group create --name penny-prod-rg --location eastus

az acr create \
  --resource-group penny-prod-rg \
  --name pennyprodacr \
  --sku Basic

az acr build \
  --registry pennyprodacr \
  --image penny:latest .

az appservice plan create \
  --resource-group penny-prod-rg \
  --name penny-prod-plan \
  --is-linux \
  --sku B1

az webapp create \
  --resource-group penny-prod-rg \
  --plan penny-prod-plan \
  --name penny-prod \
  --deployment-container-image-name pennyprodacr.azurecr.io/penny:latest

az webapp config appsettings set \
  --resource-group penny-prod-rg \
  --name penny-prod \
  --settings \
    NODE_ENV=production \
    PORT=3000 \
    PENNY_AUTH_MODE=token \
    PENNY_AUTO_MIGRATE=true \
    PENNY_CORS_ORIGINS=https://mapenny.com,https://www.mapenny.com
```

Add `DATABASE_URL`, `PENNY_API_TOKEN`, and provider API keys in the Azure Portal so shell history does not capture secrets.

## Domain Cutover

In Azure App Service, add custom domains:

- `mapenny.com`
- `www.mapenny.com`

Azure will show required DNS records. Add those records in GoDaddy, replacing the current parked records. Enable HTTPS-only after Azure validates the domains and issues certificates.

## Verification

```sh
curl -I https://<app-name>.azurewebsites.net
curl -I https://mapenny.com
```

Expected result: both return HTTP 200 or a normal app redirect. API calls should require `Authorization: Bearer <PENNY_API_TOKEN>` once production token auth is enabled.
