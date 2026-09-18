const { buildPrompts, learningCardTool } = require("./prompts.js");

const MAX_REQUEST_BYTES = 128 * 1024;
const MODES = new Set(["general", "tutor", "interview"]);
const SETTINGS = new Set(["language", "supportLanguage", "level", "role", "interviewStyle"]);

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "RequestError";
    this.status = status;
  }
}

class ServiceError extends Error {
  constructor(message, status = 502, code = "live_service_error") {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, field, limit, fallback = "") {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > limit) {
    throw new RequestError(`'${field}' must be text of at most ${limit} characters.`);
  }
  return value.trim();
}

function validatePayload(body) {
  if (!isObject(body)) throw new RequestError("Expected a JSON object.");
  const sdp = body.sdp;
  if (typeof sdp !== "string" || sdp.length > 64000 || !sdp.startsWith("v=0") || !sdp.includes("m=audio")) {
    throw new RequestError("A valid audio SDP offer is required.");
  }
  const mode = body.mode ?? "general";
  if (!MODES.has(mode)) throw new RequestError("Unknown conversation mode.");
  const instructions = text(body.instructions, "instructions", 4000);
  if (body.settings !== undefined && !isObject(body.settings)) {
    throw new RequestError("'settings' must be an object.");
  }
  const settings = {};
  for (const [key, value] of Object.entries(body.settings ?? {})) {
    if (!SETTINGS.has(key)) throw new RequestError(`Unknown setting '${key}'.`);
    settings[key] = text(value, `settings.${key}`, key === "role" ? 2000 : 100);
  }
  if (settings.interviewStyle && !["practice", "simulation"].includes(settings.interviewStyle)) {
    throw new RequestError("Interview style must be 'practice' or 'simulation'.");
  }
  if (mode === "interview" && !settings.interviewStyle) settings.interviewStyle = "practice";
  const history = body.history ?? [];
  if (!Array.isArray(history) || history.length > 24) {
    throw new RequestError("History must contain at most 24 messages.");
  }
  let historyLength = 0;
  let historyBytes = 0;
  const input = history.map((message) => {
    if (!isObject(message) || !["user", "assistant"].includes(message.role)) {
      throw new RequestError("History messages must have a user or assistant role.");
    }
    const content = text(message.text, "history.text", 12000);
    if (!content) throw new RequestError("History messages cannot be empty.");
    historyLength += content.length;
    historyBytes += new TextEncoder().encode(content).byteLength;
    return {
      role: message.role,
      content: [{ type: message.role === "user" ? "input_text" : "output_text", text: content }],
    };
  });
  if (historyLength > 12000) throw new RequestError("History exceeds 12000 characters.");
  if (historyBytes > 7600) throw new RequestError("Recent history exceeds 7600 UTF-8 bytes.");
  return { sdp, mode, instructions, settings, input };
}

function getBaseUrl(value) {
  if (!value?.trim()) throw new ServiceError("The voice service is not configured.", 503, "missing_base_url");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new ServiceError("The voice service URL is invalid.", 503, "invalid_base_url");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new ServiceError("The voice service requires a clean HTTPS base URL.", 503, "invalid_base_url");
  }
  let path = url.pathname.replace(/\/+$/, "");
  if (path.endsWith("/openai")) path += "/v1";
  else if (!path.endsWith("/openai/v1")) path += "/openai/v1";
  url.pathname = path;
  return url.toString().replace(/\/$/, "");
}

async function readJsonRequest(request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new RequestError("Expected application/json.", 415);
  }
  if (Number(request.headers.get("content-length")) > MAX_REQUEST_BYTES) {
    throw new RequestError("Request is too large.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError("A request body is required.");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestError("Request is too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    throw new RequestError("Invalid JSON payload.");
  }
}

async function createLiveSession({ payload, env, fetchImpl = fetch, signal }) {
  const { sdp, mode, instructions, settings, input } = validatePayload(payload);
  const baseUrl = getBaseUrl(env.AZURE_OPENAI_BASE_URL);
  const apiKey = env.AZURE_OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ServiceError("The voice service is not configured.", 503, "missing_gateway_key");
  const prompts = buildPrompts(mode, settings, instructions);
  const session = {
    model: env.AZURE_OPENAI_DEPLOYMENT_NAME?.trim() || "gpt-live-1",
    instructions: prompts.live,
    audio: { output: { voice: "marin" } },
    delegation: {
      type: "responses",
      responses: {
        model: env.AZURE_OPENAI_REASONING_DEPLOYMENT_NAME?.trim() || "gpt-5.6-luna",
        instructions: prompts.backend,
        reasoning: { effort: "low" },
        max_output_tokens: 2048,
        ...(mode === "tutor" ? { tools: [learningCardTool], tool_choice: "auto", parallel_tool_calls: false } : {}),
      },
    },
    ...(input.length ? { input } : {}),
  };
  const timeout = AbortSignal.timeout(30000);
  let response;
  try {
    // Creating a session is billable and not idempotent. Never retry this POST invisibly.
    response = await fetchImpl(`${baseUrl}/live/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({ session, transport: { type: "webrtc", sdp } }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw new ServiceError("Connection cancelled.", 499, "cancelled");
    if (timeout.aborted) throw new ServiceError("The voice service took too long to connect. Try again.", 504, "timeout");
    throw new ServiceError("Could not reach the voice service. Try again.", 502, "network_error");
  }
  if (!response.ok) {
    const status = response.status;
    // Do not return upstream bodies, which can contain configuration or conversation data.
    await response.body?.cancel();
    if (status === 429) throw new ServiceError("The voice service is busy. Wait a moment and try again.", 429, "rate_limited");
    if (status === 401 || status === 403) throw new ServiceError("The voice service could not authenticate. Check the gateway configuration.", 502, `upstream_${status}`);
    throw new ServiceError("The voice service could not start this session. Check the server configuration or try again.", 502, `upstream_${status}`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ServiceError("The voice service returned an invalid response.", 502, "invalid_response");
  }
  if (typeof result?.session?.id !== "string" || !result.session.id ||
      result?.transport?.type !== "webrtc" || typeof result.transport.sdp !== "string" ||
      !result.transport.sdp.startsWith("v=0")) {
    throw new ServiceError("The voice service returned an incomplete connection.", 502, "invalid_response");
  }
  return { session: { id: result.session.id }, transport: { type: "webrtc", sdp: result.transport.sdp } };
}

function errorResponse(error) {
  if (error instanceof RequestError || error instanceof ServiceError) {
    if (error instanceof ServiceError) console.error("Live session failed", { code: error.code, status: error.status });
    return { status: error.status, body: { error: error.message } };
  }
  console.error("Live session failed", { code: "unexpected_error" });
  return { status: 500, body: { error: "An unexpected error prevented the connection." } };
}

module.exports = { MAX_REQUEST_BYTES, RequestError, createLiveSession, readJsonRequest, errorResponse };
