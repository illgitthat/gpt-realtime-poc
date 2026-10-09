import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import cloudflareConfig from "../cloudflare.config.ts";
import { deploymentChildEnv, readDeploymentEnv } from "./runtime-env.mjs";

export function deployPreview({
  environment = process.env,
  args = process.argv.slice(2),
  config = cloudflareConfig({ mode: "preview", isPreview: false }),
  run = spawnSync,
} = {}) {
  const settings = readDeploymentEnv(environment.LIVE_PREVIEW_ENV, "LIVE_PREVIEW_ENV");
  const preview = config.worker;
  if (
    preview?.name !== "gpt-realtime-poc-live-preview" || preview.workersDev !== true ||
    !Array.isArray(preview.domains) || preview.domains.length !== 0 ||
    !Array.isArray(preview.triggers) || preview.triggers.length !== 0
  ) {
    throw new Error("Preview must explicitly target gpt-realtime-poc-live-preview with workers.dev and no routes.");
  }
  if (args.length > 1 || args.some((arg) => arg !== "--dry-run")) {
    throw new Error("Preview deployment accepts no target overrides.");
  }
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const cf = fileURLToPath(new URL("../node_modules/cf/bin/cf", import.meta.url));
  // Node's subprocess stdin is a socket; cat gives /dev/stdin the real pipe cf needs.
  const deploy = run("bash", [
    "-o", "pipefail", "-c", 'cat | exec "$@"', "cf-stdin",
    process.execPath, cf, "deploy", "--mode", "preview",
    "--secrets-file", "/dev/stdin", ...args,
  ], {
    cwd,
    env: deploymentChildEnv(environment),
    input: JSON.stringify(settings),
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (deploy.status !== 0) {
    throw new Error("Atomic preview deployment failed.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    deployPreview();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
