import liveCore from "../api/shared/live-core.js";

interface Env {
  AZURE_OPENAI_BASE_URL?: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_OPENAI_DEPLOYMENT_NAME?: string;
  AZURE_OPENAI_REASONING_DEPLOYMENT_NAME?: string;
  ASSETS: Fetcher;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/connect") {
      const headers = { ...corsHeaders, "Cache-Control": "no-store" };
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
      if (request.method !== "POST") {
        return Response.json({ error: "Use POST to start a conversation." }, {
          status: 405, headers: { ...headers, Allow: "POST, OPTIONS" },
        });
      }
      try {
        const payload = await liveCore.readJsonRequest(request);
        const connection = await liveCore.createLiveSession({ payload, env, signal: request.signal });
        return Response.json(connection, { status: 201, headers });
      } catch (error) {
        const result = liveCore.errorResponse(error);
        return Response.json(result.body, { status: result.status, headers });
      }
    }
    return env.ASSETS.fetch(request);
  },
};
