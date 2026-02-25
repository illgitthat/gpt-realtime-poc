import { spawnSync } from "node:child_process";

const DEFAULT_APP_NAME = process.env.SWA_APP_NAME || "gpt-realtime-poc";
const DEFAULT_RESOURCE_GROUP = process.env.SWA_RESOURCE_GROUP || "gpt-realtime-poc";
const DEFAULT_ENVIRONMENT = process.env.SWA_ENV || "production";

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
  if (process.env.SWA_CLI_DEPLOYMENT_TOKEN) {
    return process.env.SWA_CLI_DEPLOYMENT_TOKEN.trim();
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
