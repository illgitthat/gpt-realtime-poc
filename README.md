# Azure OpenAI /realtime Audio SDK

> **Note:** This project was originally forked and took inspiration from [Azure-Samples/aoai-realtime-audio-sdk](https://github.com/Azure-Samples/aoai-realtime-audio-sdk)

A WebRTC-based sample for low-latency, "speech in, speech out" conversations with `gpt-realtime`. The browser negotiates an SDP offer with a Cloudflare Worker, which exchanges it for an Azure OpenAI realtime call and streams audio plus events over a data channel.

## Quick Start

**Prerequisites:** Bun + Azure credentials (AAD service principal or API key)

```bash
bun install
bun run dev
```

Open `http://localhost:8787/`.

Set environment variables in `.dev.vars` for local dev or via `wrangler secret put` for deploy:

```
AZURE_OPENAI_BASE_URL=https://YOUR-RESOURCE-NAME.openai.azure.com

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
bun run deploy
```

Click "Start" and begin speaking.

## API Overview

The Worker exposes a single `/connect` endpoint that accepts a WebRTC SDP offer and returns the SDP answer from Azure OpenAI.

- **Client** posts `multipart/form-data` fields: `sdp`, `voice`, `instructions`.
- **Worker** requests an ephemeral token from Azure OpenAI (`/v1/realtime/client_secrets`) and exchanges the offer at `/v1/realtime/calls`.
- **Client** streams audio and events over the WebRTC data channel.

## Architecture

```
Browser <-> Cloudflare Worker <-> Azure OpenAI /realtime
```

The Worker acts as the trusted middle tier for credentials and token minting.

## Using the sample

1. Run `bun install`.
2. Set `AZURE_OPENAI_BASE_URL` plus either AAD or API key credentials.
3. Run `bun run dev` and open `http://localhost:8787/`.
4. Click the "Start" button and accept microphone permissions.
5. Choose a voice and instructions before connecting; they are sent in the SDP negotiation.

## Code description

The UI lives in [public/index.html](public/index.html) and negotiates WebRTC against `/connect`. The Cloudflare Worker entrypoint is [src/worker.ts](src/worker.ts).

## Documentation links

- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/realtime-audio-webrtc
- https://learn.microsoft.com/en-us/azure/ai-foundry/openai/how-to/realtime-audio
- https://platform.openai.com/docs/guides/realtime-webrtc
