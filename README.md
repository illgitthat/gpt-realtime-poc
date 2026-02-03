# Azure OpenAI /realtime Audio SDK

> **Note:** This project was originally forked from [Azure-Samples/aoai-realtime-audio-sdk](https://github.com/Azure-Samples/aoai-realtime-audio-sdk)

A WebSocket-based API for low-latency, "speech in, speech out" conversations with GPT-4o. Supports text messages, function calling, and voice activity detection. Azure OpenAI only.

## Quick Start

**Prerequisites:** Bun + Azure CLI (for `az login`) or a service principal

```bash
bun install
bun run build
bun start
```

Open `http://localhost:8787/` and configure the endpoint/deployment.

Authentication:
- Local dev: `az login`
- Non-interactive: set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` in `.dev.vars`

Click "Record" and start talking.

## API Overview

The `/realtime` endpoint uses WebSockets for bidirectional streaming. Key concepts:
- **Session** - Connection configuration (voice, tools, turn detection)
- **Conversation** - Accumulates input until a response is triggered
- **Response** - Contains items (messages, function calls) with streaming content parts

See [realtime-openapi3.yml](realtime-openapi3.yml) for full API specification.

## Architecture

```
End User <-> Your Service <-> Azure OpenAI /realtime
```

The API is designed for server-side use via a trusted middle tier—not direct browser connections.

## Known issues

1. Connection errors are not yet gracefully handled and looping error spew may be observed in script debug output. Please just refresh the web page if an error appears.
2. Voice selection is not yet supported.
3. If token acquisition fails, confirm Azure CLI login or service principal environment variables.

## Using the sample

1. Navigate to this folder
2. Run `bun install` to download a small number of dependency packages (see `package.json`)
3. Run `bun run build` to generate the Node server output
4. Run `bun start` and open `http://localhost:8787/`
5. In the "Endpoint" field, provide the resource endpoint of an Azure OpenAI resource; this does not need to append `/realtime` and an example structure might be `https://my-azure-openai-resource-from-portal.openai.azure.com`
6. Click the "Start" button to start the session; accept any microphone permissions dialog
7. You should see a `<< Session Started >>` message in the left-side output, after which you can speak to the app
8. You can interrupt the chat at any time by speaking and completely stop the chat by using the "Stop" button
9. Optionally, you can provide a System Message (e.g. try "You always talk like a friendly pirate") or a custom temperature; these will reflect upon the next session start

## Code description

This sample uses a custom modification of OpenAI's JavaScript SDK (https://github.com/openai/openai-node) to provide a new `realtime` client. As noted in the parent readme, this is an unofficial modification that's subject to change and does not represent any final surface details in the SDK.

The primary file demonstrating `/realtime` use is [public/main.js](./public/main.js); it connects to `/realtime` using the client, sends a session update, and processes streaming messages. The local web server and token endpoint live in [server.ts](./server.ts).
