import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultAzureCredential } from "@azure/identity";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, "public");
const INDEX_PATH = path.join(ROOT, "index.html");
const DEV_VARS_PATH = path.join(ROOT, ".dev.vars");

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

async function loadDevVars() {
  if (!existsSync(DEV_VARS_PATH)) {
    return;
  }

  const raw = await readFile(DEV_VARS_PATH, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const idx = trimmed.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function jsonConfig() {
  return {
    azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT || "",
    azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || "",
  };
}

await loadDevVars();
const credential = new DefaultAzureCredential();

const server = createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Missing URL");
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === "/config.js") {
    const config = jsonConfig();
    res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
    res.end(`window.__APP_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`);
    return;
  }

  if (pathname === "/token") {
    try {
      const token = await credential.getToken(
        "https://cognitiveservices.azure.com/.default",
      );
      if (!token) {
        res.writeHead(500);
        res.end("Unable to acquire token");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(
        JSON.stringify(
          {
            token: token.token,
            expiresOnTimestamp: token.expiresOnTimestamp,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      res.writeHead(500);
      res.end("Token request failed");
    }
    return;
  }

  let filePath = "";
  if (pathname === "/" || pathname === "/index.html") {
    filePath = INDEX_PATH;
  } else if (pathname.startsWith("/public/")) {
    const resolved = path.resolve(ROOT, "." + pathname);
    if (!resolved.startsWith(ROOT + path.sep)) {
      res.writeHead(400);
      res.end("Invalid path");
      return;
    }
    filePath = resolved;
  } else {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    const contentType = mimeTypes.get(ext) || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch (error) {
    res.writeHead(404);
    res.end("Not found");
  }
});

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
