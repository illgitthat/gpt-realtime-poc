interface Env {
  AZURE_OPENAI_ENDPOINT: string;
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
  ASSETS: Fetcher;
}

type TokenCache = {
  token: string;
  expiresAt: number;
};

let cachedToken: TokenCache | null = null;

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

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token request failed: ${text}`);
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

function configPayload(env: Env) {
  return {
    azureEndpoint: env.AZURE_OPENAI_ENDPOINT || "",
    azureDeployment: "gpt-realtime",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname === "/config.js") {
      const config = configPayload(env);
      return new Response(
        `window.__APP_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`,
        {
          headers: {
            "Content-Type": "text/javascript; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
    }

    if (pathname === "/token") {
      try {
        const token = await fetchAzureToken(env);
        return new Response(
          JSON.stringify(
            {
              token: token.token,
              expiresOnTimestamp: token.expiresAt,
            },
            null,
            2,
          ),
          {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      } catch (error) {
        return new Response("Token request failed", { status: 500 });
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
