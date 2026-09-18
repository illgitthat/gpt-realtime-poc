import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { experimental_generateTypes } from "wrangler";

const args = process.argv.slice(2);
if (args.length > 1 || args.some((arg) => arg !== "--check")) {
  console.error("Use npm run types or npm run types:check.");
  process.exit(1);
}

process.chdir(fileURLToPath(new URL("../", import.meta.url)));
const path = "worker-configuration.d.ts";
const generated = await experimental_generateTypes({
  config: "wrangler.jsonc",
  path,
  includeEnv: false,
});
// Wrangler appends whitespace to its runtime-version header.
const content = generated.content.replace(/[ \t]+$/gm, "");
if (args.includes("--check")) {
  if (readFileSync(path, "utf8") !== content) {
    console.error("Worker types are out of date. Run npm run types.");
    process.exitCode = 1;
  } else {
    console.log("Worker types are up to date.");
  }
} else {
  writeFileSync(path, content);
  console.log("Generated worker-configuration.d.ts without trailing whitespace.");
}
