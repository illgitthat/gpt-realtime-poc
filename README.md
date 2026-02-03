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

## Known Issues

- Connection errors require page refresh
- Voice selection not yet supported
