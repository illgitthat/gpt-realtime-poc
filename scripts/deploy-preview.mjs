import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deploymentChildEnv, readDeploymentEnv } from "./runtime-env.mjs";

export function deployPreview({
  environment = process.env,
  args = process.argv.slice(2),
  config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")),
  run = spawnSync,
} = {}) {
  const settings = readDeploymentEnv(environment.LIVE_PREVIEW_ENV, "LIVE_PREVIEW_ENV");
  const preview = config.env?.preview;
  if (
    preview?.name !== "gpt-realtime-poc-live-preview" || preview.workers_dev !== true ||
    !Array.isArray(preview.routes) || preview.routes.length !== 0
  ) {
    throw new Error("Preview must explicitly target gpt-realtime-poc-live-preview with workers.dev and no routes.");
  }
  if (args.length > 1 || args.some((arg) => arg !== "--dry-run")) {
    throw new Error("Preview deployment accepts no target overrides.");
  }
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  // Node's subprocess stdin is a socket; cat gives /dev/stdin the real pipe Wrangler needs.
  const deploy = run("bash", [
    "-o", "pipefail", "-c", 'cat | exec "$@"', "wrangler-stdin",
    process.execPath, wrangler, "deploy", "--env", "preview",
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
