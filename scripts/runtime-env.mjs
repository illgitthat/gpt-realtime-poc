export const runtimeEnvNames = [
  "AZURE_OPENAI_BASE_URL",
  "AZURE_OPENAI_API_KEY",
  "AZURE_OPENAI_DEPLOYMENT_NAME",
  "AZURE_OPENAI_REASONING_DEPLOYMENT_NAME",
];

export function readRuntimeEnv(environment) {
  const settings = {};
  for (const name of runtimeEnvNames) {
    const value = environment[name];
    if (value !== undefined && (typeof value !== "string" || /[\r\n]/.test(value))) {
      throw new Error(`${name} must be a single-line string.`);
    }
    settings[name] = value?.trim() || "";
  }
  if (!settings.AZURE_OPENAI_BASE_URL || !settings.AZURE_OPENAI_API_KEY) {
    throw new Error("AZURE_OPENAI_BASE_URL and AZURE_OPENAI_API_KEY are required.");
  }
  let url;
  try {
    url = new URL(settings.AZURE_OPENAI_BASE_URL);
  } catch {
    throw new Error("AZURE_OPENAI_BASE_URL must be an HTTPS general gateway URL ending in /openai/v1.");
  }
  if (
    url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
    !url.pathname.replace(/\/+$/, "").endsWith("/openai/v1")
  ) {
    throw new Error("AZURE_OPENAI_BASE_URL must be an HTTPS general gateway URL ending in /openai/v1.");
  }
  settings.AZURE_OPENAI_BASE_URL = settings.AZURE_OPENAI_BASE_URL.replace(/\/+$/, "");
  settings.AZURE_OPENAI_DEPLOYMENT_NAME ||= "gpt-live-1";
  settings.AZURE_OPENAI_REASONING_DEPLOYMENT_NAME ||= "gpt-6-luna";
  return settings;
}

export function readDeploymentEnv(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a nonempty JSON secret before deployment.`);
  }
  let settings;
  try {
    settings = JSON.parse(value);
  } catch {
    throw new Error(`${name} must contain valid JSON.`);
  }
  if (
    !settings || Array.isArray(settings) || typeof settings !== "object" ||
    Object.keys(settings).some((name) => !runtimeEnvNames.includes(name))
  ) {
    throw new Error(`${name} may contain only the four documented runtime environment variables.`);
  }
  return readRuntimeEnv(settings);
}

export function deploymentChildEnv(environment) {
  const result = { ...environment };
  for (const name of [...runtimeEnvNames, "LIVE_PREVIEW_ENV", "LIVE_PRODUCTION_ENV"]) {
    delete result[name];
  }
  return result;
}
