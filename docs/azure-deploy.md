# Azure Deployment Runbook

## Cost-Sensitive Recommendation

Penny is not a static-only site right now. The frontend is built by Vite, but the app also starts a Node API and requires `DATABASE_URL` for Postgres-backed state. Do not use Azure Static Web Apps alone for the production app unless the backend is split out first.

Use this low-cost Azure shape for the first hosted version:

- Azure App Service for Containers on Linux `B1`.
- Azure Container Registry `Basic`.
- Azure Database for PostgreSQL Flexible Server, Burstable `B1ms`, smallest practical storage.
- Azure-managed TLS certificates on App Service custom domains.

If Azure credits are available through YC Deals or Microsoft for Startups, apply the credits before creating the paid resources. The credits should cover this architecture for a long time at MVP traffic, but still set a budget alert because Azure credits can be burned accidentally by oversized databases, extra App Service plans, logging, or idle test resources.

Cheaper alternatives:

- Azure Static Web Apps Free is cheaper, but only fits if Penny becomes a static frontend plus serverless/API backend.
- Azure Storage static website is cheaper still, but does not fit this repo by itself because Penny needs the Node server and Postgres.
- A small VPS can be cheaper than Azure after credits expire, but it adds ops burden and is outside the Azure credit path.

## Target Architecture

- Azure App Service for Containers runs the Penny Node server.
- Azure Database for PostgreSQL Flexible Server stores Penny state.
- `mapenny.com` and `www.mapenny.com` point to the App Service custom domain.
- Runtime secrets live in Azure App Service application settings, not in repo files.

## Azure Resources

Create these in the same region, for example `eastus`:

- Resource group: `penny-prod-rg`
- Container registry: `pennyprodacr`
- PostgreSQL Flexible Server: `penny-prod-postgres`, Burstable `B1ms`
- App Service plan: Linux `B1`
- Web App for Containers: `penny-prod`

Do not create multiple App Service plans while experimenting. One App Service plan is the main recurring web-hosting cost.

## Required App Settings

Set these on the web app:

```text
NODE_ENV=production
PORT=3000
WEBSITES_PORT=3000
PENNY_DEPLOY_ENV=private-alpha
DATABASE_URL=postgresql://<user>:<password>@<postgres-host>:5432/<database>?sslmode=require
PENNY_AUTH_MODE=token
PENNY_API_TOKEN=<long-random-token>
PENNY_SESSION_SECRET=<long-random-secret>
PENNY_CORS_ORIGINS=https://mapenny.com,https://www.mapenny.com
PENNY_RATE_LIMIT_MAX=120
PENNY_RATE_LIMIT_WINDOW_MS=60000
PENNY_AUTH_FAILURE_RATE_LIMIT_MAX=10
PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS=60000
PENNY_TRUST_AUTH_HEADERS=false
PENNY_STRUCTURED_LOGS=true
PENNY_CREATE_MODEL_BACKED=false
PENNY_AUTO_MIGRATE=true
ENABLE_GMAIL_CONNECTOR=false
ENABLE_RESTRICTED_GOOGLE_SCOPES=false
```

Optional provider settings:

```text
XAI_API_KEY=<secret>
XAI_MODEL=<model>
XAI_BASE_URL=https://api.x.ai/v1
ANTHROPIC_API_KEY=<secret>
```

## First Deploy

The fastest path is the checked-in bootstrap script:

```sh
scripts/azure-bootstrap.sh
```

It creates the low-cost Azure resources, writes the required App Service settings, stores the matching GitHub Actions secrets, and starts the manual deploy workflow. From an authenticated Azure CLI session, the manual equivalent is:

```sh
az account show

az group create --name penny-prod-rg --location eastus

az postgres flexible-server create \
  --resource-group penny-prod-rg \
  --name penny-prod-postgres \
  --location eastus \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --admin-user pennyadmin \
  --database-name penny

az postgres flexible-server firewall-rule create \
  --resource-group penny-prod-rg \
  --name penny-prod-postgres \
  --rule-name allow-azure-services \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

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
    WEBSITES_PORT=3000 \
    PENNY_DEPLOY_ENV=private-alpha \
    PENNY_AUTH_MODE=token \
    PENNY_AUTO_MIGRATE=true \
    PENNY_RATE_LIMIT_MAX=120 \
    PENNY_RATE_LIMIT_WINDOW_MS=60000 \
    PENNY_AUTH_FAILURE_RATE_LIMIT_MAX=10 \
    PENNY_AUTH_FAILURE_RATE_LIMIT_WINDOW_MS=60000 \
    PENNY_TRUST_AUTH_HEADERS=false \
    PENNY_STRUCTURED_LOGS=true \
    PENNY_CREATE_MODEL_BACKED=false \
    ENABLE_GMAIL_CONNECTOR=false \
    ENABLE_RESTRICTED_GOOGLE_SCOPES=false \
    PENNY_CORS_ORIGINS=https://mapenny.com,https://www.mapenny.com
```

Add `DATABASE_URL`, `PENNY_API_TOKEN`, `PENNY_SESSION_SECRET`, and provider API keys in the Azure Portal so shell history does not capture secrets.

Use this `DATABASE_URL` shape:

```text
postgresql://pennyadmin:<password>@penny-prod-postgres.postgres.database.azure.com:5432/penny?sslmode=require
```

After secrets are set, restart the web app:

```sh
az webapp restart --resource-group penny-prod-rg --name penny-prod
```

## Domain Cutover

In Azure App Service, add custom domains in this order:

- `www.mapenny.com`
- `mapenny.com`

Azure will show required DNS records. Add those records at the current DNS host for `mapenny.com`, replacing parked-site records.

Typical records:

- `www` subdomain: `CNAME` to `penny-prod.azurewebsites.net`.
- Apex/root `mapenny.com`: use the App Service custom-domain instructions shown in the portal. This usually includes an `A` record to the App Service inbound IP and a `TXT` record for domain verification.

After Azure validates both domains:

```sh
az webapp update \
  --resource-group penny-prod-rg \
  --name penny-prod \
  --https-only true
```

Then add Azure-managed certificates for both custom domains in the App Service TLS/SSL blade and bind them with SNI SSL.

## GitHub Redeploys

The GitHub Actions workflow is manual-only on purpose so normal commits do not burn Actions minutes:

```sh
gh workflow run deploy-azure.yml --repo picturesuo/Penny --ref main
```

Required GitHub secrets are `ACR_LOGIN_SERVER`, `ACR_USERNAME`, `ACR_PASSWORD`, `AZURE_CREDENTIALS`, `AZURE_RESOURCE_GROUP`, `AZURE_WEBAPP_NAME`, `DATABASE_URL`, `PENNY_API_TOKEN`, `PENNY_CORS_ORIGINS`, and `PENNY_SESSION_SECRET`. `PENNY_PUBLIC_SMOKE_BASE_URL` is optional; if omitted, the workflow smokes `https://<AZURE_WEBAPP_NAME>.azurewebsites.net`.

Before starting the manual workflow, run the aggregate launch gate and deploy-secret preflight:

```sh
pnpm check:launch-readiness
pnpm check:github-deploy-secrets
```

Do not trigger `deploy-azure.yml` until that command passes. As of May 24, 2026, the safe deterministic secrets have been set in GitHub, but `DATABASE_URL` is still missing and must point at the real Azure Postgres database:

```sh
DATABASE_URL='postgresql://pennyadmin:<password>@penny-prod-postgres.postgres.database.azure.com:5432/penny?sslmode=require' \
  pnpm check:database-url-candidate -- --set-github-secret
```

That command verifies the candidate under strict private-alpha readiness before writing the GitHub secret. Do not use the current `.env.local` database candidate for deploy; as of May 24, 2026, it fails schema connectivity with `tenant/user ... not found`.

The current machine also needs `az login` before `scripts/azure-bootstrap.sh` or direct Azure resource checks can run.

The workflow builds and pushes the container, applies strict Penny settings, restarts App Service, and runs `scripts/smoke-public-staging.mjs` against the deployed URL.

## Repo Visibility And Actions Minutes

GitHub's billing docs say standard GitHub-hosted Actions runners are free for public repositories, while private repositories spend included minutes. Do not flip Penny public just to save minutes until the tracked repo has passed a publication review:

```sh
pnpm check:public-repo-safety
```

The routine checker fails on tracked env files or high-confidence secret patterns. It also warns on committed proof screenshots, videos, and traces under `docs/proof/`; those artifacts should be reviewed or moved out of the public history before changing repository visibility.

For the actual publication gate, use strict mode:

```sh
pnpm check:public-repo-publish
```

Strict mode fails on proof-media warnings too. If it fails, keep the repo private or publish from a sanitized mirror/new repository instead of flipping this repository public.

To prepare that sanitized mirror:

```sh
pnpm prepare:public-snapshot -- --out tmp/penny-public-snapshot --force
cd tmp/penny-public-snapshot
node scripts/check-public-repo-safety.mjs --strict
```

The snapshot is a new one-commit Git repository generated from the current tracked tree. It excludes `docs/proof/**`, tracked local env files, and unallowlisted binary/media files, then writes `PUBLIC-SNAPSHOT.md` with the source commit. After reviewing the snapshot, publish that directory to a new public GitHub repo instead of changing visibility on the private repository's full history.

To update the existing mirror, dry-run first, then publish:

```sh
pnpm publish:public-snapshot -- --snapshot tmp/penny-public-snapshot --repo picturesuo/penny-public --dry-run
pnpm publish:public-snapshot -- --snapshot tmp/penny-public-snapshot --repo picturesuo/penny-public
pnpm check:public-mirror -- --repo picturesuo/penny-public
```

The publish command uses the GitHub Git Data API instead of `git push`, because large proof history and local HTTP pack behavior have made normal pushes unreliable. By default it force-points the public branch at a one-commit sanitized snapshot so the mirror never inherits private repo history. The mirror check clones the public repo and verifies strict public safety, one-commit history, no `docs/proof/**` files, and only allowlisted media.

Current public mirror:

- URL: `https://github.com/picturesuo/penny-public`
- Verification: run `pnpm check:public-mirror -- --repo picturesuo/penny-public` to print the current public commit, recorded private source commit, one-commit history status, proof-file count, media allowlist, and strict safety result.

## Cost Guardrails

- Set a monthly Azure budget alert immediately after creating the resource group.
- Keep the database on Burstable `B1ms` until there is a measured bottleneck.
- Avoid Azure Front Door, Application Gateway, Premium database tiers, and extra App Service plans for the MVP.
- Turn off or delete test resource groups after experiments.
- Keep production logs modest; verbose logging can become a quiet recurring cost.

## Verification

```sh
curl -I https://<app-name>.azurewebsites.net
curl -I https://mapenny.com
curl -I https://www.mapenny.com
```

Expected result: each frontend URL returns HTTP 200 or a normal app redirect. API calls should require `Authorization: Bearer <PENNY_API_TOKEN>` once production token auth is enabled.

Then run the product smoke:

```sh
PENNY_PUBLIC_SMOKE_BASE_URL=https://<app-name>.azurewebsites.net \
PENNY_PUBLIC_SMOKE_API_TOKEN=<token> \
pnpm smoke:public-staging
```
