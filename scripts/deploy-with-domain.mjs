import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function parseEnvFile(content) {
    const env = {};
    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }
        const eqIndex = line.indexOf("=");
        if (eqIndex === -1) {
            continue;
        }
        const key = line.slice(0, eqIndex).trim();
        const value = line.slice(eqIndex + 1).trim();
        if (key) {
            env[key] = value;
        }
    }
    return env;
}

const cwd = process.cwd();
const configPath = path.join(cwd, "wrangler.jsonc");
const envPath = path.join(cwd, ".dev.vars");

if (!fs.existsSync(configPath)) {
    console.error("Missing wrangler.jsonc in the current directory.");
    process.exit(1);
}

const configText = fs.readFileSync(configPath, "utf8");
let config;
try {
    config = JSON.parse(configText);
} catch (error) {
    console.error("wrangler.jsonc must be valid JSON for this script to parse it.");
    console.error(String(error));
    process.exit(1);
}

if (!fs.existsSync(envPath)) {
    console.error("Missing .dev.vars. Add WORKER_DOMAIN to that file.");
    process.exit(1);
}

const envVars = parseEnvFile(fs.readFileSync(envPath, "utf8"));
const domain = envVars.WORKER_DOMAIN || envVars.WORKER_ROUTE;

if (!domain) {
    console.error("Missing WORKER_DOMAIN (or WORKER_ROUTE) in .dev.vars.");
    process.exit(1);
}

config.routes = [
    {
        pattern: domain,
        custom_domain: true,
    },
];

const tmpConfigPath = path.join(cwd, "wrangler.tmp.json");
fs.writeFileSync(tmpConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

const extraArgs = process.argv.slice(2);
const result = spawnSync("wrangler", ["deploy", "--config", tmpConfigPath, ...extraArgs], {
    stdio: "inherit",
});

try {
    fs.rmSync(tmpConfigPath, { force: true });
} catch (error) {
    console.error("Failed to remove temporary wrangler config:", error);
}

process.exit(result.status ?? 1);
