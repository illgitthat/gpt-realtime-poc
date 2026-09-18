import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => !["--production", "--preview"].includes(arg))) {
  console.error("Use npm run deploy:swa [-- --production]. The default target is preview.");
  process.exit(1);
}
if (!process.env.SWA_CLI_DEPLOYMENT_TOKEN?.trim()) {
  console.error("Set SWA_CLI_DEPLOYMENT_TOKEN for the existing Static Web App.");
  process.exit(1);
}
const production = args.includes("--production");
const branch = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" });
const onMain = process.env.GITHUB_ACTIONS === "true"
  ? process.env.GITHUB_REF === "refs/heads/main"
  : branch.status === 0 && branch.stdout.trim() === "main";
if (production && !onMain) {
  console.error("Production deployment is allowed only from main.");
  process.exit(1);
}
const swa = fileURLToPath(new URL("../node_modules/@azure/static-web-apps-cli/dist/cli/bin.js", import.meta.url));
const result = spawnSync(process.execPath, [
  swa, "deploy", "--env", production ? "production" : "preview", "--api-language", "node", "--api-version", "22",
], { cwd: fileURLToPath(new URL("../", import.meta.url)), stdio: "inherit" });
process.exit(result.status ?? 1);
