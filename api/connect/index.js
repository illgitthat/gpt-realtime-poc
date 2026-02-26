const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

let cachedToken = null;

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.name = "BadRequestError";
    this.status = 400;
  }
}

function buildSessionConfig(options = {}) {
  const session = {
    type: "realtime",
    model: "gpt-realtime-1.5",
  };

  if (options.voice) {
    session.audio = { output: { voice: options.voice } };
  }

  if (options.instructions && options.instructions.trim()) {
    session.instructions = options.instructions;
  }

  return { session };
}

function getRequiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function getBaseUrl() {
  let baseUrl = getRequiredEnv("AZURE_OPENAI_BASE_URL");

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

function resolveAuthHeaders() {
  const tenantId = String(process.env.AZURE_TENANT_ID || "").trim();
  const clientId = String(process.env.AZURE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.AZURE_CLIENT_SECRET || "").trim();
  const apiKey = String(process.env.AZURE_OPENAI_API_KEY || "").trim();

  if (apiKey) {
    return { source: "apiKey", headers: { "api-key": apiKey } };
  }

  if (tenantId && clientId && clientSecret) {
    return { source: "aad", headers: {} };
  }

  throw new Error("Missing Azure AD credentials or AZURE_OPENAI_API_KEY.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(error) {
  const message = String(error || "");
  return [
    /DNS lookup failed/i,
    /Temporary failure in name resolution/i,
    /ENOTFOUND/i,
    /EAI_AGAIN/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
  ].some((pattern) => pattern.test(message));
}

async function fetchWithTimeout(url, init, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(url, init, timeoutMs = 25000, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchWithTimeout(url, init, timeoutMs);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === retries) {
        throw error;
      }
      const backoffMs = 250 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      await sleep(backoffMs);
    }
  }

  throw lastError;
}

async function fetchAzureToken() {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60000) {
    return cachedToken;
  }

  const tenantId = getRequiredEnv("AZURE_TENANT_ID");
  const clientId = getRequiredEnv("AZURE_CLIENT_ID");
  const clientSecret = getRequiredEnv("AZURE_CLIENT_SECRET");

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://cognitiveservices.azure.com/.default",
  });

  const response = await fetchWithRetry(
    tokenUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
    20000,
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token request failed: ${response.status} - ${text}`);
  }

  const data = await response.json();
  if (!data || !data.access_token) {
    throw new Error("Token response missing access_token.");
  }

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 0) * 1000,
  };

  return cachedToken;
}

async function getEphemeralToken(options = {}) {
  const auth = resolveAuthHeaders();
  const bearerToken = auth.source === "aad" ? await fetchAzureToken() : null;
  const baseUrl = getBaseUrl();
  const sessionConfig = buildSessionConfig(options);

  const response = await fetchWithRetry(`${baseUrl}/v1/realtime/client_secrets`, {
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
  if (!data || !data.value) {
    throw new Error("No ephemeral token in response");
  }

  return data.value;
}

async function performSdpNegotiation(ephemeralToken, sdpOffer) {
  const baseUrl = getBaseUrl();
  const response = await fetchWithRetry(`${baseUrl}/v1/realtime/calls`, {
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

function getHeader(req, name) {
  const target = name.toLowerCase();
  const headers = req && req.headers ? req.headers : {};

  if (headers && typeof headers.get === "function") {
    return String(headers.get(name) || headers.get(target) || "");
  }

  return String(headers[target] || headers[name] || "");
}

function parseJsonPayload(rawBody) {
  try {
    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object") {
      throw new BadRequestError("Expected JSON object payload.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }
    throw new BadRequestError("Invalid JSON payload.");
  }
}

async function parseMultipartPayload(req, contentType) {
  const multipartBody = req.rawBody ?? req.body;

  if (multipartBody == null || multipartBody === "") {
    return {};
  }

  try {
    const formRequest = new Request("http://localhost/connect", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: multipartBody,
    });
    const formData = await formRequest.formData();
    const payload = {};

    for (const key of ["sdp", "voice", "instructions"]) {
      const value = formData.get(key);
      if (typeof value === "string") {
        payload[key] = value;
      }
    }

    return payload;
  } catch (_error) {
    throw new BadRequestError("Invalid multipart/form-data payload.");
  }
}

async function parseConnectPayload(req) {
  const contentType = getHeader(req, "Content-Type").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    return parseMultipartPayload(req, contentType);
  }

  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.rawBody === "string" && req.rawBody.trim()) {
    return parseJsonPayload(req.rawBody);
  }

  if (typeof req.body === "string" && req.body.trim()) {
    return parseJsonPayload(req.body);
  }

  return {};
}

module.exports = async function connect(context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: corsHeaders };
    return;
  }

  try {
    const payload = await parseConnectPayload(req);
    const sdp = payload && typeof payload.sdp === "string" ? payload.sdp : "";

    if (!sdp) {
      context.res = {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: { error: "Missing 'sdp' field" },
      };
      return;
    }

    const voice = typeof payload.voice === "string" && payload.voice ? payload.voice : "alloy";
    const instructions =
      typeof payload.instructions === "string" ? payload.instructions : "";

    const ephemeralToken = await getEphemeralToken({ voice, instructions });
    const sdpAnswer = await performSdpNegotiation(ephemeralToken, sdp);

    context.res = {
      status: 201,
      headers: { "Content-Type": "application/sdp", ...corsHeaders },
      body: sdpAnswer,
    };
  } catch (error) {
    context.res = {
      status: error && error.status === 400 ? 400 : 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: { error: String(error) },
    };
  }
};
