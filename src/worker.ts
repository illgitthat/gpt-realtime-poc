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

// Session configuration for ephemeral token requests
function buildSessionConfig(env: Env) {
  return {
    session: {
      type: "realtime",
      model: "gpt-realtime",
      instructions: "You are a helpful assistant.",
      audio: {
        output: {
          voice: "alloy",
        },
      },
    },
  };
}

async function fetchAzureToken(env: Env): Promise<TokenCache> {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60000) {
    console.log("Using cached Azure AD token");
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

  console.log(`Requesting Azure AD token from: ${tokenUrl}`);
  console.log(`Client ID prefix: ${(clientId || "").substring(0, 8)}...`);

  const startTime = Date.now();
  const response = await fetchWithTimeout(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  }, 20000);

  console.log(`Azure AD token response in ${Date.now() - startTime}ms, status: ${response.status}`);
  console.log(
    `Azure AD token headers: content-type=${response.headers.get("content-type") || ""}, x-ms-request-id=${response.headers.get("x-ms-request-id") || ""}`,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token request failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (!data?.access_token) {
    throw new Error("Token response missing access_token.");
  }

  console.log("Azure AD token acquired");

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
 * Get the base URL for Azure OpenAI API calls (without trailing slash)
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
 * Get an ephemeral client secret token from Azure OpenAI
 */
async function getEphemeralToken(env: Env): Promise<string> {
  const auth = resolveAuthHeaders(env);
  const bearerToken = auth.source === "aad" ? await fetchAzureToken(env) : null;
  const baseUrl = getBaseUrl(env);
  const sessionConfig = buildSessionConfig(env);

  const url = `${baseUrl}/v1/realtime/client_secrets`;
  console.log(`Requesting ephemeral token from: ${url}`);
  if (bearerToken) {
    console.log(`Using bearer token (first 20 chars): ${bearerToken.token.substring(0, 20)}...`);
  } else {
    console.log("Using API key authentication for ephemeral token request");
  }
  console.log(`Session config model: ${sessionConfig.session.model}, voice: ${sessionConfig.session.audio?.output?.voice}`);

  const startTime = Date.now();
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken.token}` } : auth.headers),
    },
    body: JSON.stringify(sessionConfig),
  });
  console.log(`Ephemeral token request took ${Date.now() - startTime}ms, status: ${response.status}`);
  console.log(`Ephemeral token response headers: content-type=${response.headers.get("content-type") || ""}, x-request-id=${response.headers.get("x-request-id") || ""}`);

  if (!response.ok) {
    const text = await response.text();
    console.error(`Ephemeral token request failed: ${response.status} - ${text}`);
    throw new Error(`Ephemeral token request failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  console.log(`Ephemeral token response keys: ${Object.keys(data).join(", ")}`);
  const ephemeralToken = data.value;

  if (!ephemeralToken) {
    console.error("No ephemeral token in response:", JSON.stringify(data));
    throw new Error("No ephemeral token available");
  }

  console.log(`Got ephemeral token (first 20 chars): ${ephemeralToken.substring(0, 20)}...`);
  return ephemeralToken;
}

/**
 * Perform SDP negotiation with Azure OpenAI Realtime API
 */
async function performSdpNegotiation(
  env: Env,
  ephemeralToken: string,
  sdpOffer: string
): Promise<{ sdpAnswer: string; locationHeader: string }> {
  const baseUrl = getBaseUrl(env);
  const realtimeUrl = `${baseUrl}/v1/realtime/calls`;

  console.log(`Sending SDP offer to: ${realtimeUrl}`);
  console.log(`SDP offer size: ${sdpOffer.length} bytes`);
  console.log(`Ephemeral token prefix: ${ephemeralToken.substring(0, 12)}...`);

  const startTime = Date.now();
  const response = await fetchWithTimeout(realtimeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ephemeralToken}`,
      "Content-Type": "application/sdp",
    },
    body: sdpOffer,
  });
  console.log(`SDP POST completed in ${Date.now() - startTime}ms, status: ${response.status}`);
  console.log(
    `SDP response headers: content-type=${response.headers.get("content-type") || ""}, location=${response.headers.get("Location") || ""}, x-request-id=${response.headers.get("x-request-id") || ""}`,
  );

  if (response.status !== 201) {
    const text = await response.text();
    console.error(`SDP negotiation failed: ${response.status} - ${text}`);
    throw new Error(`SDP negotiation failed: ${response.status} - ${text}`);
  }

  const sdpAnswer = await response.text();
  const locationHeader = response.headers.get("Location") || "";

  console.log(`SDP negotiation successful, Location: ${locationHeader}`);

  return { sdpAnswer, locationHeader };
}

function configPayload(env: Env) {
  return {
    azureEndpoint: env.AZURE_OPENAI_BASE_URL || "",
    azureDeployment: "gpt-realtime",
  };
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

    if (pathname === "/config.js") {
      const config = configPayload(env);
      return new Response(
        `window.__APP_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
        {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
            ...corsHeaders,
          },
        },
      );
    }

    if (pathname === "/token") {
      try {
        const auth = resolveAuthHeaders(env);
        if (auth.source === "apiKey") {
          const apiKey = (env.AZURE_OPENAI_API_KEY || "").trim();
          return new Response(
            JSON.stringify(
              {
                token: apiKey,
                tokenType: "apiKey",
                expiresOnTimestamp: Date.now() + 60 * 60 * 1000,
              },
              null,
              2,
            ),
            {
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                ...corsHeaders,
              },
            },
          );
        }

        const token = await fetchAzureToken(env);
        return new Response(
          JSON.stringify(
            {
              token: token.token,
              expiresOnTimestamp: token.expiresAt,
              tokenType: "aad",
            },
            null,
            2,
          ),
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              ...corsHeaders,
            },
          },
        );
      } catch (error) {
        console.error("Token request failed:", error);
        return new Response("Token request failed", { status: 500, headers: corsHeaders });
      }
    }

    // New endpoint: Get ephemeral client secret for WebRTC
    if (pathname === "/client_secrets") {
      try {
        const ephemeralToken = await getEphemeralToken(env);
        const baseUrl = getBaseUrl(env);

        return new Response(
          JSON.stringify({
            token: ephemeralToken,
            endpoint: baseUrl,
            deployment: getDeploymentName(env),
          }),
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
              ...corsHeaders,
            },
          },
        );
      } catch (error) {
        console.error("Client secrets request failed:", error);
        return new Response(
          JSON.stringify({ error: `Failed to generate ephemeral token: ${error}` }),
          { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
    }

    // New endpoint: SDP negotiation for WebRTC
    if (pathname === "/connect" && request.method === "POST") {
      try {
        const contentType = request.headers.get("Content-Type") || "";
        let sdpOffer: string;

        // Handle multipart/form-data (from browser FormData)
        if (contentType.includes("multipart/form-data")) {
          const formData = await request.formData();
          const sdpField = formData.get("sdp");
          if (!sdpField || typeof sdpField !== "string") {
            return new Response(
              JSON.stringify({ error: "Missing 'sdp' field in form data" }),
              { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
            );
          }
          sdpOffer = sdpField;
        } else if (contentType.includes("application/sdp")) {
          // Handle raw SDP content
          sdpOffer = await request.text();
        } else {
          return new Response(
            JSON.stringify({ error: "Expected multipart/form-data or application/sdp content type" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        console.log(
          `Received SDP offer content-type=${contentType}, length=${sdpOffer.length} (first 100 chars): ${sdpOffer.substring(0, 100)}...`,
        );

        console.log("Starting ephemeral token request for SDP negotiation");

        // Get ephemeral token
        const ephemeralToken = await getEphemeralToken(env);
        console.log(`Got ephemeral token for SDP negotiation (first 12 chars): ${ephemeralToken.substring(0, 12)}...`);

        // Perform SDP negotiation
        const { sdpAnswer, locationHeader } = await performSdpNegotiation(
          env,
          ephemeralToken,
          sdpOffer
        );

        console.log(`SDP answer length: ${sdpAnswer.length}`);

        // Return SDP answer as plain text with 201 status
        const responseHeaders: Record<string, string> = {
          "Content-Type": "application/sdp",
          ...corsHeaders,
        };

        if (locationHeader) {
          responseHeaders["Location"] = locationHeader;
        }

        return new Response(sdpAnswer, {
          status: 201,
          headers: responseHeaders,
        });
      } catch (error) {
        console.error("Connect/SDP negotiation failed:", error);
        return new Response(
          JSON.stringify({ error: `SDP negotiation failed: ${error}` }),
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
