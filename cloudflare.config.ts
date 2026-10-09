import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode }) => {
  if (mode !== undefined && mode !== "production" && mode !== "preview") {
    throw new Error("Use production or preview mode.");
  }
  const preview = mode === "preview";
  return {
    worker: {
      name: preview ? "gpt-realtime-poc-live-preview" : "gpt-realtime-poc",
      compatibilityDate: "2026-09-18",
      entrypoint: "src/worker.ts",
      workersDev: true,
      domains: preview ? [] : ["voice.adamcbloom.com"],
      triggers: [],
      observability: { logs: { enabled: true, invocationLogs: true } },
      assets: { htmlHandling: "auto-trailing-slash" },
      env: { ASSETS: bindings.assets() },
      // cf has no --keep-vars flag; retain dashboard variables in production.
      ...(!preview ? {
        unsafe: { metadata: { keep_bindings: ["secret_text", "secret_key", "plain_text", "json"] } },
      } : {}),
    },
  };
});
