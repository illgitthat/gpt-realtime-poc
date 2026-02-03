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

let cachedToken: TokenCache | null = null;

// Session config for ephemeral tokens
interface SessionOptions {
  voice?: string;
  instructions?: string;
}

function buildSessionConfig(options: SessionOptions = {}) {
  const session: Record<string, unknown> = {
    type: "realtime",
    model: "gpt-realtime",
  };
  if (options.voice) {
    session.audio = { output: { voice: options.voice } };
  }
  if (options.instructions?.trim()) {
    session.instructions = options.instructions;
  }
  return { session };
}

async function fetchAzureToken(env: Env): Promise<TokenCache> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60000) {
    return cachedToken;
  }

  const tenantId = env.AZURE_TENANT_ID;
  const clientId = env.AZURE_CLIENT_ID;
  const clientSecret = env.AZURE_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Missing Azure AD credentials.");
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://cognitiveservices.azure.com/.default",
  });

  const response = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }, 20000);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token request failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error("Token response missing access_token.");
  }

  const expiresIn = Number(data.expires_in || 0);
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return cachedToken;
}

function resolveAuthHeaders(env: Env): { headers: Record<string, string>; source: "aad" | "apiKey" } {
  const tenantId = (env.AZURE_TENANT_ID || "").trim();
  const clientId = (env.AZURE_CLIENT_ID || "").trim();
  const clientSecret = (env.AZURE_CLIENT_SECRET || "").trim();
  const apiKey = (env.AZURE_OPENAI_API_KEY || "").trim();

  const hasAadCreds = Boolean(tenantId && clientId && clientSecret);
  if (hasAadCreds) {
    return { headers: {}, source: "aad" };
  }

  if (apiKey) {
    return { headers: { "api-key": apiKey }, source: "apiKey" };
  }

  throw new Error("Missing Azure AD credentials or AZURE_OPENAI_API_KEY.");
}

/**
 * Get base URL for Azure OpenAI API
 */
function getBaseUrl(env: Env): string {
  let baseUrl = (env.AZURE_OPENAI_BASE_URL || "").trim();
  if (!baseUrl) {
    throw new Error("Missing AZURE_OPENAI_BASE_URL.");
  }
  if (baseUrl.endsWith("/openai/v1")) {
    baseUrl = baseUrl.slice(0, -3);
  }
  if (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }
  if (!baseUrl.endsWith("/openai")) {
    baseUrl = `${baseUrl}/openai`;
  }
  return baseUrl;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 25000,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Get ephemeral token from Azure OpenAI
 */
async function getEphemeralToken(env: Env, options: SessionOptions = {}): Promise<string> {
  const auth = resolveAuthHeaders(env);
  const bearerToken = auth.source === "aad" ? await fetchAzureToken(env) : null;
  const baseUrl = getBaseUrl(env);
  const sessionConfig = buildSessionConfig(options);

  const url = `${baseUrl}/v1/realtime/client_secrets`;
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken.token}` } : auth.headers),
    },
    body: JSON.stringify(sessionConfig),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ephemeral token request failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (!data.value) {
    throw new Error("No ephemeral token in response");
  }
  return data.value;
}

/** Perform SDP negotiation with Azure OpenAI */
async function performSdpNegotiation(
  ephemeralToken: string,
  sdpOffer: string,
  baseUrl: string
): Promise<string> {
  const response = await fetchWithTimeout(`${baseUrl}/v1/realtime/calls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ephemeralToken}`,
      "Content-Type": "application/sdp",
    },
    body: sdpOffer,
  });

  if (response.status !== 201) {
    const text = await response.text();
    throw new Error(`SDP negotiation failed: ${response.status} - ${text}`);
  }

  return response.text();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS headers for all responses
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // SDP negotiation for WebRTC
    if (pathname === "/connect" && request.method === "POST") {
      try {
        if (!request.headers.get("Content-Type")?.includes("multipart/form-data")) {
          return new Response(
            JSON.stringify({ error: "Expected multipart/form-data" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        const formData = await request.formData();
        const sdpOffer = formData.get("sdp");
        if (!sdpOffer || typeof sdpOffer !== "string") {
          return new Response(
            JSON.stringify({ error: "Missing 'sdp' field" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        const voice = (formData.get("voice") as string) || "alloy";
        const instructions = (formData.get("instructions") as string) || "";

        // Get ephemeral token and perform SDP negotiation
        const baseUrl = getBaseUrl(env);
        const ephemeralToken = await getEphemeralToken(env, { voice, instructions });
        const sdpAnswer = await performSdpNegotiation(ephemeralToken, sdpOffer, baseUrl);

        return new Response(sdpAnswer, {
          status: 201,
          headers: { "Content-Type": "application/sdp", ...corsHeaders },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: String(error) }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
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
