# Azure OpenAI /realtime Audio SDK

> **Note:** This project was originally forked and took inspiration from [Azure-Samples/aoai-realtime-audio-sdk](https://github.com/Azure-Samples/aoai-realtime-audio-sdk)

A WebRTC-based sample for low-latency, "speech in, speech out" conversations with `gpt-realtime-1.5`. The browser negotiates an SDP offer with a backend `/connect` endpoint, which exchanges it for an Azure OpenAI realtime call and streams audio plus events over a data channel.

## Quick Start

**Prerequisites:**
- Uses `gpt-realtime-1.5` model for audio and `gpt-4o-transcribe` for transcription.
- Bun + Azure credentials (AAD service principal with access to your OpenAI resources or an API key).
- Set environment variables:
  - Cloudflare Worker local/dev: `.dev.vars`
  - Cloudflare Worker deploy: `wrangler secret put`
  - Azure Static Web Apps: SWA Application Settings

```
AZURE_OPENAI_BASE_URL=https://YOUR-RESOURCE-NAME.openai.azure.com

# Optional: custom domain for deploy (gitignored)
WORKER_DOMAIN=voice.example.com

# Option A: Azure AD (service principal)
AZURE_TENANT_ID=...
AZURE_CLIENT_ID=...
AZURE_CLIENT_SECRET=...

# Option B: API key
AZURE_OPENAI_API_KEY=...
```

Cloudflare deploy:

```
wrangler secret put AZURE_OPENAI_BASE_URL
wrangler secret put AZURE_TENANT_ID
wrangler secret put AZURE_CLIENT_ID
wrangler secret put AZURE_CLIENT_SECRET
wrangler secret put AZURE_OPENAI_API_KEY

# Deploy with a custom domain from .dev.vars
bun run deploy

# Deploy without a custom domain
bun run deploy:plain
```

Azure Static Web Apps deploy:

```bash
# one-time login for this terminal/session
az login

# optional: ensure the desired subscription is selected
az account set --subscription "<SUBSCRIPTION_ID_OR_NAME>"

# deploy using your active az subscription
npm run deploy:swa
```

Optional environment variables for `deploy:swa`:
- `SWA_APP_NAME` (target Static Web App resource)
- `SWA_RESOURCE_GROUP`
- `SWA_ENV` (`production` by default)
- `SWA_CLI_DEPLOYMENT_TOKEN` (skip interactive login)

Local dev:

```bash
bun install
bun run dev
```

Open `http://localhost:8787/`, click "Start", and begin speaking.

Azure SWA local emulator:

```bash
npm run dev:swa
```

Open `http://localhost:4280/`.

## API Overview

The backend exposes a single `/connect` endpoint that accepts a WebRTC SDP offer and returns the SDP answer from Azure OpenAI.

- **Client** posts JSON: `sdp`, `voice`, `instructions`.
- **Backend** requests an ephemeral token from Azure OpenAI (`/v1/realtime/client_secrets`) and exchanges the offer at `/v1/realtime/calls`.
- **Client** streams audio and events over the WebRTC data channel.

## Architecture

```
Browser <-> (Cloudflare Worker OR SWA API Function) <-> Azure OpenAI /realtime
```

The backend acts as the trusted middle tier for credentials and token minting.

## Code description

The UI lives in [public/index.html](public/index.html) and negotiates WebRTC against `/connect`.
- Cloudflare Worker entrypoint: [src/worker.ts](src/worker.ts)
- Azure SWA API function: [api/connect/index.js](api/connect/index.js)

## Documentation links

- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/realtime-audio-webrtc
- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/realtime-audio
- https://platform.openai.com/docs/guides/realtime-webrtc
