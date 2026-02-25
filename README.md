# Azure OpenAI /realtime Audio SDK

> **Note:** This project was originally forked and took inspiration from [Azure-Samples/aoai-realtime-audio-sdk](https://github.com/Azure-Samples/aoai-realtime-audio-sdk)

A WebRTC-based sample for low-latency, "speech in, speech out" conversations with `gpt-realtime-1.5`.
The browser sends an SDP offer to `/connect`, and the backend exchanges it with Azure OpenAI realtime APIs.

## Deployment Paths

This repo supports two production deployment targets:

1. **Cloudflare Worker**
2. **Azure Static Web Apps (SWA)**

Use Cloudflare if you want the existing Worker deployment flow.
Use Azure SWA if you want Azure-hosted static frontend + Azure Functions API.

## Prerequisites

- Bun / Node.js
- Azure CLI (`az`) logged in to the target subscription
- GitHub CLI (`gh`) authenticated (required for Azure SWA GitHub Actions setup)
- Azure OpenAI credentials

Shared environment values:

```bash
AZURE_OPENAI_BASE_URL=https://YOUR-RESOURCE-NAME.openai.azure.com

# Option A: API key
AZURE_OPENAI_API_KEY=...

# Option B: AAD service principal
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...
```

For local Worker development these can live in `.dev.vars`.
If both API key and AAD credentials exist, API key auth is used.

## Local Development

Cloudflare Worker local dev:

```bash
bun install
bun run dev
```

Open `http://localhost:8787/`.

Azure SWA emulator local dev:

```bash
bun install
bun run dev:swa
```

Open `http://localhost:4280/`.

## Cloudflare Deployment

```bash
wrangler secret put AZURE_OPENAI_BASE_URL
wrangler secret put AZURE_TENANT_ID
wrangler secret put AZURE_CLIENT_ID
wrangler secret put AZURE_CLIENT_SECRET
wrangler secret put AZURE_OPENAI_API_KEY

# Deploy with custom domain from .dev.vars
bun run deploy

# Deploy without custom domain
bun run deploy:plain
```

## Azure SWA Deployment (Recommended)

### 1. One-time Azure setup

```bash
az login
gh auth login
bun run setup:swa
```

`setup:swa` does the following:

- Ensures resource group exists (default: `gpt-realtime-poc`)
- Ensures Static Web App exists (default name: `gpt-realtime-poc`)
- Syncs Azure OpenAI settings into SWA app settings
- Syncs SWA deployment token to GitHub secret `AZURE_STATIC_WEB_APPS_API_TOKEN`

Auth mode behavior in `setup:swa`:

- If `AZURE_OPENAI_API_KEY` is present, SWA is configured for API-key auth and AAD app settings are removed.
- Otherwise, SWA is configured for AAD auth (`AZURE_TENANT_ID` + `AZURE_CLIENT_ID` + `AZURE_CLIENT_SECRET`).

Optional overrides:

- `SWA_RESOURCE_GROUP` (default `gpt-realtime-poc`)
- `SWA_APP_NAME` (default `gpt-realtime-poc`)
- `SWA_LOCATION` (default `eastus2`)
- `SWA_SKU` (default `Free`)

### 2. Deploy via GitHub Actions

This repo includes a stable workflow at `.github/workflows/azure-static-web-apps.yml`.

- Push to `main` to deploy automatically
- Or run the workflow manually with `workflow_dispatch`

### 3. Optional direct CLI deploy

```bash
bun run deploy:swa
```

This deploys with SWA deployment token auth and defaults to:

- SWA app name: `gpt-realtime-poc`
- resource group: `gpt-realtime-poc`
- environment: `production`

Optional overrides:

- `SWA_APP_NAME`
- `SWA_RESOURCE_GROUP`
- `SWA_ENV`
- `SWA_CLI_DEPLOYMENT_TOKEN`

## API Overview

The backend exposes `/connect`.

- Client posts JSON: `sdp`, `voice`, `instructions`
- Backend requests ephemeral token from Azure OpenAI (`/v1/realtime/client_secrets`)
- Backend exchanges SDP at `/v1/realtime/calls`

## Architecture

```text
Browser <-> (Cloudflare Worker OR SWA API Function) <-> Azure OpenAI /realtime
```

## Code Map

- UI: `public/index.html`
- Cloudflare Worker backend: `src/worker.ts`
- SWA API backend: `api/connect/index.js`
- SWA runtime routing: `public/staticwebapp.config.json`

## Documentation links

- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/realtime-audio-webrtc
- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/realtime-audio
- https://platform.openai.com/docs/guides/realtime-webrtc
