const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

module.exports = async function geminiToken(context, req) {
  if (req.method === "OPTIONS") {
    context.res = { status: 204, headers: corsHeaders };
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: { error: "Gemini API key not configured" },
    };
    return;
  }

  try {
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();

    const tokenResp = await fetch(
      `https://generativelanguage.googleapis.com/v1alpha/auth_tokens?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uses: 1,
          expireTime,
          newSessionExpireTime,
        }),
      },
    );

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      context.res = {
        status: 502,
        headers: { "Content-Type": "application/json", ...corsHeaders },
        body: { error: `Token creation failed: ${tokenResp.status} - ${text}` },
      };
      return;
    }

    const data = await tokenResp.json();
    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: { token: data.name },
    };
  } catch (error) {
    context.res = {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
      body: { error: error && error.message ? error.message : String(error) },
    };
  }
};
