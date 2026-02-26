import realtimeCore from "../api/shared/realtime-core.js";

interface Env {
  AZURE_OPENAI_BASE_URL: string;
  AZURE_OPENAI_API_KEY?: string;
  AZURE_TENANT_ID?: string;
  AZURE_CLIENT_ID?: string;
  AZURE_CLIENT_SECRET?: string;
  ASSETS: Fetcher;
}

type TokenCache = {
  token: string;
  expiresAt: number;
};

interface SessionOptions {
  voice?: string;
  instructions?: string;
}

interface ConnectRequestPayload {
  sdp: string;
  voice?: string;
  instructions?: string;
}

const { exchangeSdpOffer, toErrorMessage } = realtimeCore;

let cachedToken: TokenCache | null = null;

class BadRequestError extends Error {}

async function parseConnectRequest(request: Request): Promise<ConnectRequestPayload> {
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    let body: Partial<ConnectRequestPayload>;
    try {
      body = await request.json<Partial<ConnectRequestPayload>>();
    } catch (_error) {
      throw new BadRequestError("Invalid JSON payload.");
    }

    if (!body?.sdp || typeof body.sdp !== "string") {
      throw new BadRequestError("Missing 'sdp' field");
    }

    return {
      sdp: body.sdp,
      voice: typeof body.voice === "string" ? body.voice : undefined,
      instructions: typeof body.instructions === "string" ? body.instructions : undefined,
    };
  }

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (_error) {
      throw new BadRequestError("Invalid multipart/form-data payload.");
    }

    const sdp = formData.get("sdp");
    if (!sdp || typeof sdp !== "string") {
      throw new BadRequestError("Missing 'sdp' field");
    }

    const voice = formData.get("voice");
    const instructions = formData.get("instructions");

    return {
      sdp,
      voice: typeof voice === "string" ? voice : undefined,
      instructions: typeof instructions === "string" ? instructions : undefined,
    };
  }

  throw new BadRequestError("Expected application/json or multipart/form-data");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (pathname === "/connect" && request.method === "POST") {
      try {
        let payload: ConnectRequestPayload;
        try {
          payload = await parseConnectRequest(request);
        } catch (error) {
          return new Response(
            JSON.stringify({ error: toErrorMessage(error) }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        const sessionOptions: SessionOptions = {
          voice: payload.voice || "alloy",
          instructions: payload.instructions || "",
        };

        const result = await exchangeSdpOffer({
          fetchImpl: fetch,
          baseUrl: env.AZURE_OPENAI_BASE_URL,
          credentials: {
            apiKey: env.AZURE_OPENAI_API_KEY,
            tenantId: env.AZURE_TENANT_ID,
            clientId: env.AZURE_CLIENT_ID,
            clientSecret: env.AZURE_CLIENT_SECRET,
          },
          sessionOptions,
          sdpOffer: payload.sdp,
          cachedToken,
        });

        cachedToken = result.cachedToken;

        return new Response(result.sdpAnswer, {
          status: 201,
          headers: { "Content-Type": "application/sdp", ...corsHeaders },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: toErrorMessage(error) }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
    }

    if (pathname === "/") {
      const indexUrl = new URL(request.url);
      indexUrl.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(indexUrl, request));
    }

    return env.ASSETS.fetch(request);
  },
};
