import { spawnSync } from "node:child_process";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readActiveSubscriptionId() {
  const result = spawnSync("az", ["account", "show", "--query", "id", "-o", "tsv"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    return "";
  }

  return (result.stdout || "").trim();
}

const deployEnv = process.env.SWA_ENV || "production";
const appName = (process.env.SWA_APP_NAME || "").trim();
const resourceGroup = (process.env.SWA_RESOURCE_GROUP || "").trim();
const deploymentToken = (process.env.SWA_CLI_DEPLOYMENT_TOKEN || "").trim();
const subscriptionId = (process.env.AZURE_SUBSCRIPTION_ID || readActiveSubscriptionId()).trim();

if (!deploymentToken) {
  const loginArgs = ["swa", "login"];

  if (subscriptionId) {
    loginArgs.push("--subscription-id", subscriptionId);
  }

  if (resourceGroup) {
    loginArgs.push("--resource-group", resourceGroup);
  }

  run("npx", loginArgs);
}

const deployArgs = ["swa", "deploy", "--env", deployEnv];

if (appName) {
  deployArgs.push("--app-name", appName);
}

if (resourceGroup) {
  deployArgs.push("--resource-group", resourceGroup);
}

if (deploymentToken) {
  deployArgs.push("--deployment-token", deploymentToken);
}

run("npx", deployArgs);
