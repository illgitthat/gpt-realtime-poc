import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { unstable_getVarsForDev, unstable_readConfig } from "wrangler";
import { deployPreview } from "./deploy-preview.mjs";
import { deployProduction } from "./deploy-with-domain.mjs";
import { readDeploymentEnv, readRuntimeEnv, runtimeEnvNames } from "./runtime-env.mjs";

const values = {
  AZURE_OPENAI_BASE_URL: "https://gateway.example.com/general/openai/v1/",
  AZURE_OPENAI_API_KEY: "test-only-placeholder",
};
const config = JSON.parse(readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const previewOptions = {
  environment: {
    ...values,
    LIVE_PREVIEW_ENV: JSON.stringify(values),
    LIVE_PRODUCTION_ENV: "other-target-secret-must-not-leak",
  },
  args: [],
  config,
};
const productionOptions = {
  environment: {
    ...values,
    LIVE_PRODUCTION_ENV: JSON.stringify(values),
    LIVE_PREVIEW_ENV: "other-target-secret-must-not-leak",
    GITHUB_ACTIONS: "true",
    GITHUB_REF: "refs/heads/main",
  },
  args: ["--production"],
  config,
};

test("installed Wrangler loads credentials and optional model overrides for root and preview", () => {
  const directory = fileURLToPath(new URL(`../.wrangler/config-test-${randomUUID()}/`, import.meta.url));
  mkdirSync(directory, { recursive: true });
  try {
    const configPath = join(directory, "wrangler.jsonc");
    writeFileSync(configPath, JSON.stringify({
      ...config,
      main: fileURLToPath(new URL("../src/worker.ts", import.meta.url)),
      assets: { ...config.assets, directory: fileURLToPath(new URL("../public", import.meta.url)) },
    }));
    for (const expected of [
      {
        ...values,
        AZURE_OPENAI_DEPLOYMENT_NAME: "custom-live",
        AZURE_OPENAI_REASONING_DEPLOYMENT_NAME: "custom-reasoning",
      },
      values,
    ]) {
      writeFileSync(join(directory, ".dev.vars"), Object.entries(expected).map(([key, value]) => `${key}=${value}`).join("\n"));
      for (const env of [undefined, "preview"]) {
        const resolved = unstable_readConfig({ config: configPath, env }, { hideWarnings: true });
        const bindings = unstable_getVarsForDev(configPath, undefined, resolved.vars, env, true, resolved.secrets);
        const loaded = Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, binding.value]));
        assert.deepEqual(loaded, expected, `${env || "root"} must load .dev.vars without filtering`);
        const runtime = readRuntimeEnv(loaded);
        assert.equal(runtime.AZURE_OPENAI_DEPLOYMENT_NAME, expected.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-live-1");
        assert.equal(runtime.AZURE_OPENAI_REASONING_DEPLOYMENT_NAME, expected.AZURE_OPENAI_REASONING_DEPLOYMENT_NAME || "gpt-5.6-sol");
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("deployment credentials reject empty, malformed, unexpected, or unsafe values without echoing them", () => {
  for (const value of [
    "", "{}", "[]", "null", '{"AZURE_OPENAI_API_KEY":123}',
    JSON.stringify({ ...values, EXTRA: "not-allowed" }), "secret-sentinel-invalid-json",
  ]) {
    for (const name of ["LIVE_PREVIEW_ENV", "LIVE_PRODUCTION_ENV"]) {
      assert.throws(() => readDeploymentEnv(value, name), (error) => !error.message.includes("secret-sentinel"));
    }
  }
  for (const base of [
    "http://gateway.example.com/openai/v1",
    "https://gateway.example.com/realtime",
    "https://user:password@gateway.example.com/openai/v1",
    "https://gateway.example.com/openai/v1?key=secret",
  ]) {
    assert.throws(() => readRuntimeEnv({ ...values, AZURE_OPENAI_BASE_URL: base }));
  }
  assert.throws(() => readRuntimeEnv({ ...values, AZURE_OPENAI_API_KEY: "line\nbreak" }));
});

test("preview and production deploy code and secrets atomically with stdin-only runtime credentials", () => {
  for (const [deploy, options, target, keep] of [
    [deployPreview, previewOptions, "preview", false],
    [deployProduction, productionOptions, "", true],
  ]) {
    const calls = [];
    deploy({ ...options, run: (...args) => { calls.push(args); return { status: 0 }; } });
    assert.equal(calls.length, 1);
    const [, args, spawnOptions] = calls[0];
    assert.ok(args.includes("deploy"));
    assert.equal(args[args.indexOf("--env") + 1], target);
    assert.equal(args[args.indexOf("--secrets-file") + 1], "/dev/stdin");
    assert.equal(args.includes("--keep-vars"), keep);
    assert.deepEqual(JSON.parse(spawnOptions.input), readRuntimeEnv(values));
    assert.deepEqual(spawnOptions.stdio, ["pipe", "inherit", "inherit"]);
    for (const name of [...runtimeEnvNames, "LIVE_PREVIEW_ENV", "LIVE_PRODUCTION_ENV"]) {
      assert.ok(!(name in spawnOptions.env), `${name} must not be inherited by subprocesses`);
    }
    assert.ok(!JSON.stringify(args).includes(values.AZURE_OPENAI_API_KEY));
    assert.ok(!JSON.stringify(spawnOptions.env).includes("other-target-secret-must-not-leak"));
  }
});

test("preview refuses missing secrets, production names, inherited routes, and argument overrides before mutation", () => {
  const run = () => assert.fail("No Cloudflare command should run");
  for (const options of [
    { environment: { LIVE_PREVIEW_ENV: "" } },
    { args: ["--name", "gpt-realtime-poc"] },
    { config: { env: { preview: { ...config.env.preview, name: config.name } } } },
    { config: { env: { preview: { ...config.env.preview, routes: undefined } } } },
    { config: { env: { preview: { ...config.env.preview, routes: config.routes } } } },
    { config: { env: { preview: { ...config.env.preview, workers_dev: false } } } },
  ]) {
    assert.throws(() => deployPreview({ ...previewOptions, ...options, run }));
  }
});

test("production requires validated configuration and the main ref before any deployment", () => {
  const run = () => assert.fail("No command should run");
  for (const options of [
    { environment: { ...productionOptions.environment, LIVE_PRODUCTION_ENV: "" } },
    { environment: { ...productionOptions.environment, LIVE_PRODUCTION_ENV: "secret-sentinel-invalid-json" } },
    { environment: { ...productionOptions.environment, GITHUB_REF: "refs/heads/feature" } },
    { args: ["--production", "--env", "preview"] },
    { config: { ...config, name: "gpt-realtime-poc-live-preview" } },
    { config: { ...config, routes: [] } },
  ]) {
    assert.throws(() => deployProduction({ ...productionOptions, ...options, run }));
  }
});

test("atomic deployment failures fail the workflow without a separate secret upload or retry", () => {
  for (const [deploy, options] of [[deployPreview, previewOptions], [deployProduction, productionOptions]]) {
    let calls = 0;
    assert.throws(() => deploy({
      ...options,
      run: () => { calls += 1; return { status: 1 }; },
    }), /Atomic .* deployment failed/);
    assert.equal(calls, 1);
  }
});

test("installed Wrangler accepts atomic stdin secrets in safe dry-runs without logging placeholder values", {
  skip: process.platform === "win32",
}, () => {
  for (const [deploy, options] of [[deployPreview, previewOptions], [deployProduction, productionOptions]]) {
    let calls = 0;
    deploy({
      ...options,
      environment: { ...process.env, ...options.environment },
      args: [...options.args, "--dry-run"],
      run: (command, args, spawnOptions) => {
        assert.ok(args.includes("--dry-run"), "This integration test must never deploy");
        calls += 1;
        const result = spawnSync(command, args, { ...spawnOptions, stdio: ["pipe", "pipe", "pipe"], encoding: "utf8" });
        const output = `${result.stdout}${result.stderr}`;
        assert.equal(result.status, 0, "Wrangler must support --secrets-file /dev/stdin");
        assert.match(output, /--dry-run: exiting now/);
        assert.match(output, /AZURE_OPENAI_API_KEY/);
        for (const value of Object.values(readRuntimeEnv(values))) {
          assert.ok(!output.includes(value), "Wrangler must hide supplied runtime values");
        }
        return result;
      },
    });
    assert.equal(calls, 1);
  }
});

test("CLI guardrails reject branch production deployment and secret leaks without cloud calls", () => {
  const checks = [
    ["deploy-preview.mjs", [], { LIVE_PREVIEW_ENV: "secret-sentinel-invalid-json" }],
    ["deploy-with-domain.mjs", ["--production"], { LIVE_PRODUCTION_ENV: JSON.stringify(values) }],
    ["deploy-with-domain.mjs", ["--production", "--env", "preview"], {}],
    ["deploy-swa.mjs", ["--production"], { SWA_CLI_DEPLOYMENT_TOKEN: "test-only-placeholder" }],
    ["setup-swa.mjs", [], {}],
  ];
  for (const [file, args, environment] of checks) {
    const result = spawnSync(process.execPath, [new URL(file, import.meta.url).pathname, ...args], {
      encoding: "utf8",
      env: { ...process.env, ...environment, GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/feature" },
    });
    assert.equal(result.status, 1, `${file}: ${result.stdout} ${result.stderr}`);
    assert.ok(!`${result.stdout}${result.stderr}`.includes("secret-sentinel-invalid-json"));
  }
});
