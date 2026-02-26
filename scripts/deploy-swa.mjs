import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

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

const dotEnvVars = parseDotEnvFile(".dev.vars");

function getConfigValue(name, fallback = "") {
  const localValue = String(dotEnvVars[name] || "").trim();
  if (localValue) {
    return localValue;
  }

  const envValue = String(process.env[name] || "").trim();
  if (envValue) {
    return envValue;
  }

  return fallback;
}

const DEFAULT_APP_NAME = getConfigValue("SWA_APP_NAME", "gpt-realtime-poc");
const DEFAULT_RESOURCE_GROUP = getConfigValue("SWA_RESOURCE_GROUP", "gpt-realtime-poc");
const DEFAULT_ENVIRONMENT = getConfigValue("SWA_ENV", "production");

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || "").trim(),
  };
}

function readDeploymentToken(appName, resourceGroup) {
  const explicitToken = getConfigValue("SWA_CLI_DEPLOYMENT_TOKEN", "");
  if (explicitToken) {
    return explicitToken;
  }

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
    console.error("Failed to resolve SWA deployment token. Set SWA_CLI_DEPLOYMENT_TOKEN or run setup:swa.");
    process.exit(1);
  }

  return result.stdout;
}

const deploymentToken = readDeploymentToken(DEFAULT_APP_NAME, DEFAULT_RESOURCE_GROUP);

run("bunx", [
  "swa",
  "deploy",
  "--app-name",
  DEFAULT_APP_NAME,
  "--resource-group",
  DEFAULT_RESOURCE_GROUP,
  "--env",
  DEFAULT_ENVIRONMENT,
  "--api-language",
  "node",
  "--api-version",
  "20",
  "--deployment-token",
  deploymentToken,
]);
