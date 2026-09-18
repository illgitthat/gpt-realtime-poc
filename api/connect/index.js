const { createLiveSession, readJsonRequest, errorResponse } = require("../shared/live-core.js");

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

module.exports = async function connect(context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers };
    return;
  }
  if (req.method !== "POST") {
    context.res = { status: 405, headers: { ...headers, Allow: "POST, OPTIONS" }, body: { error: "Use POST to start a conversation." } };
    return;
  }
  try {
    const body = req.rawBody ?? (typeof req.body === "string" ? req.body : JSON.stringify(req.body));
    const request = new Request("https://localhost/connect", { method: "POST", headers: req.headers, body });
    const payload = await readJsonRequest(request);
    const result = await createLiveSession({ payload, env: process.env });
    context.res = { status: 201, headers, body: result };
  } catch (error) {
    context.res = { ...errorResponse(error), headers };
  }
};
