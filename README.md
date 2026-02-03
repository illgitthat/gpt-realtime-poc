# Azure OpenAI /realtime Audio SDK

> **Note:** This project was originally forked from [Azure-Samples/aoai-realtime-audio-sdk](https://github.com/Azure-Samples/aoai-realtime-audio-sdk)

A WebSocket-based API for low-latency, "speech in, speech out" conversations with GPT-4o. Supports text messages, function calling, and voice activity detection. Works with both Azure OpenAI and OpenAI endpoints.

## Quick Start

**Prerequisites:** Node.js

```bash
# Download the client library
./download-pkg.sh  # or: pwsh ./download-pkg.ps1

# Install and run
npm install
npm run dev
```

Open `http://localhost:5173/` and configure:
- **Azure OpenAI:** Endpoint + API Key
- **OpenAI:** API Key only

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
3. More authentication mechanisms, including keyless support via Entra, will come in a future service update.

## Using the sample

1. Navigate to this folder
2. Run `npm install` to download a small number of dependency packages (see `package.json`)
3. Run `npm run dev` to start the web server, navigating any firewall permissions prompts
4. Use any of the provided URIs from the console output, e.g. `http://localhost:5173/`, in a browser
5. In the "Endpoint" field, provide the resource endpoint of an Azure OpenAI resource; this does not need to append `/realtime` and an example structure might be `https://my-azure-openai-resource-from-portal.openai.azure.com`
6. In the "API Key" field, provide a corresponding API key
7. Click the "Record" button to start the session; accept any microphone permissions dialog
8. You should see a `<< Session Started >>` message in the left-side output, after which you can speak to the app
9. You can interrupt the chat at any time by speaking and completely stop the chat by using the "Stop" button
10. Optionally, you can provide a System Message (e.g. try "You always talk like a friendly pirate") or a custom temperature; these will reflect upon the next session start

## Code description

This sample uses a custom modification of OpenAI's JavaScript SDK (https://github.com/openai/openai-node) to provide a new `realtime` client. As noted in the parent readme, this is an unofficial modification that's subject to change and does not represent any final surface details in the SDK.

The primary file demonstrating `/realtime` use is [src/main.ts](./src/main.ts); the first few functions demonstrate connecting to `/realtime` using the client, sending an inference configuration message, and then processing the send/receive of messages on the connection.
