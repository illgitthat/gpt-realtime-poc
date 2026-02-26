function toErrorMessage(error) {
  if (error && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return String(error);
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

function getBaseUrl(baseUrlInput) {
  let baseUrl = String(baseUrlInput || "").trim();
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

function resolveAuthHeaders(credentials = {}) {
  const tenantId = String(credentials.tenantId || "").trim();
  const clientId = String(credentials.clientId || "").trim();
  const clientSecret = String(credentials.clientSecret || "").trim();
  const apiKey = String(credentials.apiKey || "").trim();

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

async function fetchWithTimeout(fetchImpl, url, init, timeoutMs = 25000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(fetchImpl, url, init, timeoutMs = 25000, retries = 2) {
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchWithTimeout(fetchImpl, url, init, timeoutMs);
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

async function fetchAzureToken({ fetchImpl, credentials, cachedToken }) {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 60000) {
    return cachedToken;
  }

  const tenantId = String(credentials.tenantId || "").trim();
  const clientId = String(credentials.clientId || "").trim();
  const clientSecret = String(credentials.clientSecret || "").trim();

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

  const response = await fetchWithRetry(
    fetchImpl,
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

  return {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 0) * 1000,
  };
}

async function getEphemeralToken({
  fetchImpl,
  baseUrl,
  auth,
  bearerToken,
  sessionOptions,
}) {
  const sessionConfig = buildSessionConfig(sessionOptions);
  const response = await fetchWithRetry(fetchImpl, `${baseUrl}/v1/realtime/client_secrets`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : auth.headers),
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

async function performSdpNegotiation({ fetchImpl, baseUrl, ephemeralToken, sdpOffer }) {
  const response = await fetchWithRetry(fetchImpl, `${baseUrl}/v1/realtime/calls`, {
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

async function exchangeSdpOffer({
  fetchImpl,
  baseUrl,
  credentials,
  sessionOptions,
  sdpOffer,
  cachedToken,
}) {
  const normalizedBaseUrl = getBaseUrl(baseUrl);
  const auth = resolveAuthHeaders(credentials);

  let nextCachedToken = cachedToken || null;
  let bearerToken;

  if (auth.source === "aad") {
    nextCachedToken = await fetchAzureToken({
      fetchImpl,
      credentials,
      cachedToken: nextCachedToken,
    });
    bearerToken = nextCachedToken.token;
  } else {
    nextCachedToken = null;
  }

  const ephemeralToken = await getEphemeralToken({
    fetchImpl,
    baseUrl: normalizedBaseUrl,
    auth,
    bearerToken,
    sessionOptions,
  });

  const sdpAnswer = await performSdpNegotiation({
    fetchImpl,
    baseUrl: normalizedBaseUrl,
    ephemeralToken,
    sdpOffer,
  });

  return { sdpAnswer, cachedToken: nextCachedToken };
}

module.exports = {
  exchangeSdpOffer,
  toErrorMessage,
};
