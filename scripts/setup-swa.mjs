import { spawnSync } from "node:child_process";
import { readRuntimeEnv } from "./runtime-env.mjs";

function run(args) {
  const result = spawnSync("az", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error("Azure CLI command failed. No resource will be created automatically.");
  }
}

try {
  if (process.argv.length !== 3 || process.argv[2] !== "--apply") {
    throw new Error("Use npm run setup:swa -- --apply to configure an existing Static Web App.");
  }
  const appName = process.env.SWA_APP_NAME?.trim();
  const resourceGroup = process.env.SWA_RESOURCE_GROUP?.trim();
  if (!appName || !resourceGroup) {
    throw new Error("Set SWA_APP_NAME and SWA_RESOURCE_GROUP for the existing Static Web App.");
  }
  const settings = readRuntimeEnv(process.env);
  const target = ["--name", appName, "--resource-group", resourceGroup];
  run(["staticwebapp", "show", ...target, "-o", "none"]);
  const environment = process.env.SWA_ENVIRONMENT_NAME?.trim();
  run([
    "staticwebapp", "appsettings", "set", ...target,
    ...(environment ? ["--environment-name", environment] : []),
    "--setting-names", ...Object.entries(settings).map(([key, value]) => `${key}=${value}`),
    "-o", "none",
  ]);
  console.log("Configured the four runtime settings on the selected existing SWA environment.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
