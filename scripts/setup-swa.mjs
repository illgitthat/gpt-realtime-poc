import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const DEFAULT_RESOURCE_GROUP = process.env.SWA_RESOURCE_GROUP || "gpt-realtime-poc";
const DEFAULT_APP_NAME = process.env.SWA_APP_NAME || "gpt-realtime-poc";
const DEFAULT_LOCATION = process.env.SWA_LOCATION || "eastus2";
const DEFAULT_SKU = process.env.SWA_SKU || "Free";
const GITHUB_SECRET_NAME = process.env.SWA_GITHUB_TOKEN_SECRET || "AZURE_STATIC_WEB_APPS_API_TOKEN";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

function parseDotEnvFile(path) {
  if (!existsSync(path)) {
    return {};
  }

  const contents = readFileSync(path, "utf8");
  const values = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const idx = line.indexOf("=");
    if (idx <= 0) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function getOriginRepo() {
  const origin = runCapture("git", ["config", "--get", "remote.origin.url"]);
  if (!origin.ok || !origin.stdout) {
    return "";
  }

  const url = origin.stdout;

  const sshMatch = url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`;
  }

  const httpsMatch = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`;
  }

  return "";
}

function maybeSetGitHubSecret(secretValue) {
  const repo = getOriginRepo();
  if (!repo) {
    console.log("Skipping GitHub secret sync: origin is not a GitHub repo.");
    return;
  }

  const ghAuth = runCapture("gh", ["auth", "status"]);
  if (!ghAuth.ok) {
    console.log("Skipping GitHub secret sync: gh is not authenticated.");
    return;
  }

  const setSecret = spawnSync("gh", ["secret", "set", GITHUB_SECRET_NAME, "--repo", repo], {
    input: secretValue,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });

  if (setSecret.status !== 0) {
    console.log(`Failed to set GitHub secret ${GITHUB_SECRET_NAME}.`);
    process.exit(setSecret.status ?? 1);
  }

  console.log(`Updated GitHub secret ${GITHUB_SECRET_NAME} in ${repo}.`);
}

function ensureResourceGroup(resourceGroup, location) {
  const existing = runCapture("az", [
    "group",
    "show",
    "--name",
    resourceGroup,
    "--query",
    "location",
    "-o",
    "tsv",
  ]);

  if (existing.ok && existing.stdout) {
    console.log(`Using existing resource group ${resourceGroup} in ${existing.stdout}.`);
    return existing.stdout;
  }

  run("az", ["group", "create", "--name", resourceGroup, "--location", location, "-o", "none"]);
  return location;
}

function ensureStaticWebApp(appName, resourceGroup, location, sku) {
  const existing = runCapture("az", [
    "staticwebapp",
    "show",
    "--name",
    appName,
    "--resource-group",
    resourceGroup,
    "-o",
    "json",
  ]);

  if (existing.ok) {
    const app = JSON.parse(existing.stdout);
    console.log(`Using existing Static Web App ${app.name} (${app.defaultHostname}).`);
    return app;
  }

  run("az", [
    "staticwebapp",
    "create",
    "--name",
    appName,
    "--resource-group",
    resourceGroup,
    "--location",
    location,
    "--sku",
    sku,
    "-o",
    "none",
  ]);

  const created = runCapture("az", [
    "staticwebapp",
    "show",
    "--name",
    appName,
    "--resource-group",
    resourceGroup,
    "-o",
    "json",
  ]);

  if (!created.ok || !created.stdout) {
    console.log("Failed to read Static Web App after creation.");
    process.exit(1);
  }

  const app = JSON.parse(created.stdout);
  console.log(`Created Static Web App ${app.name} (${app.defaultHostname}).`);
  return app;
}

function syncAppSettings(appName, resourceGroup, settings) {
  const entries = Object.entries(settings).filter(([, value]) => String(value || "").trim());
  if (entries.length === 0) {
    console.log("No SWA app settings to apply.");
    return;
  }

  const args = [
    "staticwebapp",
    "appsettings",
    "set",
    "--name",
    appName,
    "--resource-group",
    resourceGroup,
    "--setting-names",
    ...entries.map(([key, value]) => `${key}=${value}`),
    "-o",
    "none",
  ];

  run("az", args);
  console.log(`Applied ${entries.length} app settings.`);
}

function readDeploymentToken(appName, resourceGroup) {
  const result = runCapture("az", [
    "staticwebapp",
    "secrets",
    "list",
    "--name",
    appName,
    "--resource-group",
    resourceGroup,
    "--query",
    "properties.apiKey",
    "-o",
    "tsv",
  ]);

  if (!result.ok || !result.stdout) {
    console.log("Failed to read SWA deployment token.");
    process.exit(1);
  }

  return result.stdout;
}

const dotEnvVars = parseDotEnvFile(".dev.vars");
const settings = {
  AZURE_OPENAI_BASE_URL:
    process.env.AZURE_OPENAI_BASE_URL || dotEnvVars.AZURE_OPENAI_BASE_URL || "",
  AZURE_OPENAI_API_KEY:
    process.env.AZURE_OPENAI_API_KEY || dotEnvVars.AZURE_OPENAI_API_KEY || "",
  AZURE_TENANT_ID:
    process.env.AZURE_TENANT_ID || dotEnvVars.AZURE_TENANT_ID || dotEnvVars.TmP_AZURE_TENANT_ID || "",
  AZURE_CLIENT_ID:
    process.env.AZURE_CLIENT_ID || dotEnvVars.AZURE_CLIENT_ID || dotEnvVars.TmP_AZURE_CLIENT_ID || "",
  AZURE_CLIENT_SECRET:
    process.env.AZURE_CLIENT_SECRET || dotEnvVars.AZURE_CLIENT_SECRET || dotEnvVars.TmP_AZURE_CLIENT_SECRET || "",
};

console.log(`Ensuring resource group ${DEFAULT_RESOURCE_GROUP} in ${DEFAULT_LOCATION}...`);
const resourceGroupLocation = ensureResourceGroup(DEFAULT_RESOURCE_GROUP, DEFAULT_LOCATION);

console.log(`Ensuring Static Web App ${DEFAULT_APP_NAME}...`);
const appLocation = process.env.SWA_LOCATION || resourceGroupLocation;
const app = ensureStaticWebApp(DEFAULT_APP_NAME, DEFAULT_RESOURCE_GROUP, appLocation, DEFAULT_SKU);

console.log("Syncing SWA application settings...");
syncAppSettings(DEFAULT_APP_NAME, DEFAULT_RESOURCE_GROUP, settings);

console.log("Reading deployment token...");
const deploymentToken = readDeploymentToken(DEFAULT_APP_NAME, DEFAULT_RESOURCE_GROUP);

maybeSetGitHubSecret(deploymentToken);

console.log("\nSWA setup complete.");
console.log(`Resource group: ${DEFAULT_RESOURCE_GROUP}`);
console.log(`Static Web App: ${app.name}`);
console.log(`URL: https://${app.defaultHostname}`);
console.log(`GitHub secret: ${GITHUB_SECRET_NAME}`);
