import assert from "node:assert/strict";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import test from "node:test";
import { unstable_getVarsForDev } from "wrangler";
import cloudflareConfig from "../cloudflare.config.ts";
import { deployPreview } from "./deploy-preview.mjs";
import { deployProduction } from "./deploy-with-domain.mjs";
import { readDeploymentEnv, readRuntimeEnv, runtimeEnvNames } from "./runtime-env.mjs";

const values = {
  AZURE_OPENAI_BASE_URL: "https://gateway.example.com/general/openai/v1/",
  AZURE_OPENAI_API_KEY: "test-only-placeholder",
};
const config = cloudflareConfig({ mode: "production", isPreview: false });
const previewConfig = cloudflareConfig({ mode: "preview", isPreview: false });
const previewOptions = {
  environment: {
    ...values,
    LIVE_PREVIEW_ENV: JSON.stringify(values),
    LIVE_PRODUCTION_ENV: "other-target-secret-must-not-leak",
  },
  args: [],
  config: previewConfig,
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

test("installed build tool loads local credentials and optional model overrides for production and preview", () => {
  const directory = fileURLToPath(new URL(`../.cloudflare/config-test-${randomUUID()}/`, import.meta.url));
  mkdirSync(directory, { recursive: true });
  try {
    const configPath = join(directory, "cloudflare.config.ts");
    for (const expected of [
      {
        ...values,
        AZURE_OPENAI_DEPLOYMENT_NAME: "custom-live",
        AZURE_OPENAI_REASONING_DEPLOYMENT_NAME: "custom-reasoning",
      },
      values,
    ]) {
      writeFileSync(join(directory, ".dev.vars"), Object.entries(expected).map(([key, value]) => `${key}=${value}`).join("\n"));
      for (const mode of ["production", "preview"]) {
        const bindings = unstable_getVarsForDev(configPath, undefined, {}, mode, true);
        const loaded = Object.fromEntries(Object.entries(bindings).map(([key, binding]) => [key, binding.value]));
        assert.deepEqual(loaded, expected, `${mode} must load .dev.vars without filtering`);
        const runtime = readRuntimeEnv(loaded);
        assert.equal(runtime.AZURE_OPENAI_DEPLOYMENT_NAME, expected.AZURE_OPENAI_DEPLOYMENT_NAME || "gpt-live-1");
        assert.equal(runtime.AZURE_OPENAI_REASONING_DEPLOYMENT_NAME, expected.AZURE_OPENAI_REASONING_DEPLOYMENT_NAME || "gpt-6-luna");
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
  for (const [deploy, options, target] of [
    [deployPreview, previewOptions, "preview"],
    [deployProduction, productionOptions, "production"],
  ]) {
    const calls = [];
    deploy({ ...options, run: (...args) => { calls.push(args); return { status: 0 }; } });
    assert.equal(calls.length, 1);
    const [, args, spawnOptions] = calls[0];
    assert.ok(args.includes("deploy"));
    assert.equal(args[args.indexOf("--mode") + 1], target);
    assert.equal(args[args.indexOf("--secrets-file") + 1], "/dev/stdin");
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
    { config: { worker: { ...previewConfig.worker, name: config.worker.name } } },
    { config: { worker: { ...previewConfig.worker, domains: undefined } } },
    { config: { worker: { ...previewConfig.worker, domains: config.worker.domains } } },
    { config: { worker: { ...previewConfig.worker, triggers: [{ type: "fetch", pattern: "example.com/*" }] } } },
    { config: { worker: { ...previewConfig.worker, workersDev: false } } },
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
    { config: { worker: { ...config.worker, name: "gpt-realtime-poc-live-preview" } } },
    { config: { worker: { ...config.worker, domains: [] } } },
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

test("installed cf builds isolated targets with atomic stdin secrets without logging their values", {
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
        assert.equal(result.status, 0, `cf must support --secrets-file /dev/stdin: ${output}`);
        assert.match(output, /--dry-run: exiting now/);
        assert.match(output, /AZURE_OPENAI_API_KEY/);
        for (const value of Object.values(readRuntimeEnv(values))) {
          assert.ok(!output.includes(value), "cf must hide supplied runtime values");
        }
        const built = JSON.parse(readFileSync(new URL("../.cloudflare/output/v0/workers/default/worker.config.json", import.meta.url), "utf8"));
        const preview = deploy === deployPreview;
        assert.equal(built.name, preview ? "gpt-realtime-poc-live-preview" : "gpt-realtime-poc");
        assert.deepEqual(built.domains, preview ? [] : ["voice.adamcbloom.com"]);
        assert.deepEqual(built.triggers, []);
        assert.equal(built.workersDev, true);
        if (!preview) {
          assert.deepEqual(built.unsafe.metadata.keep_bindings, ["secret_text", "secret_key", "plain_text", "json"]);
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
