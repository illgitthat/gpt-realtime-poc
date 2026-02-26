const { exchangeSdpOffer, toErrorMessage } = require("../shared/realtime-core.js");

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && !Buffer.isBuffer(value);
}

function toKnownPayload(input) {
  if (!isPlainObject(input)) {
    return {};
  }

  const payload = {};
  for (const key of ["sdp", "voice", "instructions"]) {
    const value = input[key];
    if (typeof value === "string") {
      payload[key] = value;
    }
  }

  return payload;
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
  const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : String(rawBody);

  try {
    const parsed = JSON.parse(bodyString);
    if (!isPlainObject(parsed)) {
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
  const parsedBodyPayload = toKnownPayload(req.body);
  if (Object.keys(parsedBodyPayload).length > 0) {
    return parsedBodyPayload;
  }

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
    return toKnownPayload(Object.fromEntries(formData.entries()));
  } catch (_error) {
    if (Object.keys(parsedBodyPayload).length > 0) {
      return parsedBodyPayload;
    }
    throw new BadRequestError("Invalid multipart/form-data payload.");
  }
}

async function parseConnectPayload(req) {
  const contentType = getHeader(req, "Content-Type").toLowerCase();

  if (contentType.includes("multipart/form-data")) {
    return parseMultipartPayload(req, contentType);
  }

  if (isPlainObject(req.body)) {
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

    const result = await exchangeSdpOffer({
      fetchImpl: fetch,
      baseUrl: process.env.AZURE_OPENAI_BASE_URL,
      credentials: {
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        tenantId: process.env.AZURE_TENANT_ID,
        clientId: process.env.AZURE_CLIENT_ID,
        clientSecret: process.env.AZURE_CLIENT_SECRET,
      },
      sessionOptions: {
        voice: typeof payload.voice === "string" && payload.voice ? payload.voice : "alloy",
        instructions: typeof payload.instructions === "string" ? payload.instructions : "",
      },
      sdpOffer: sdp,
      cachedToken,
    });

    cachedToken = result.cachedToken;

    context.res = {
      status: 201,
      headers: { "Content-Type": "application/sdp", ...corsHeaders },
      body: result.sdpAnswer,
    };
  } catch (error) {
    context.res = {
      status: error && error.status === 400 ? 400 : 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: { error: toErrorMessage(error) },
    };
  }
};
