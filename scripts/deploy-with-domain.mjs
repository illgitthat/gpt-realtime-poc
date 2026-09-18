import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deploymentChildEnv, readDeploymentEnv } from "./runtime-env.mjs";

export function deployProduction({
  environment = process.env,
  args = process.argv.slice(2),
  config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")),
  run = spawnSync,
} = {}) {
  if (!args.includes("--production") || args.some((arg) => !["--production", "--dry-run"].includes(arg))) {
    throw new Error("Use npm run deploy:production [-- --dry-run]. Target and domain overrides are not allowed.");
  }
  const settings = readDeploymentEnv(environment.LIVE_PRODUCTION_ENV, "LIVE_PRODUCTION_ENV");
  const dryRun = args.includes("--dry-run");
  const cwd = fileURLToPath(new URL("../", import.meta.url));
  const childEnvironment = deploymentChildEnv(environment);
  const onMain = environment.GITHUB_ACTIONS === "true"
    ? environment.GITHUB_REF === "refs/heads/main"
    : (() => {
      const branch = run("git", ["branch", "--show-current"], { cwd, env: childEnvironment, encoding: "utf8" });
      return branch.status === 0 && branch.stdout.trim() === "main";
    })();
  if (!dryRun && !onMain) {
    throw new Error("Production deployment is allowed only from main. Use deploy:preview for feature branches.");
  }
  if (
    config.name !== "gpt-realtime-poc" ||
    !config.routes?.some((route) => route.pattern === "voice.adamcbloom.com" && route.custom_domain === true)
  ) {
    throw new Error("Production Worker name or custom domain is missing from wrangler.jsonc.");
  }
  const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
  // Convert Node's subprocess socket to a real pipe before Wrangler opens /dev/stdin.
  const result = run("bash", [
    "-o", "pipefail", "-c", 'cat | exec "$@"', "wrangler-stdin",
    process.execPath, wrangler, "deploy", "--env", "", "--keep-vars",
    "--secrets-file", "/dev/stdin", ...(dryRun ? ["--dry-run"] : []),
  ], {
    cwd,
    env: childEnvironment,
    input: JSON.stringify(settings),
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error("Atomic production deployment failed.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    deployProduction();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
