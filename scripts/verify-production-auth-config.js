"use strict";

const MANAGEMENT_API_ORIGIN = "https://api.supabase.com";

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "") + "/";
    return url.toString();
  } catch {
    return "";
  }
}

function validateProductionAuthConfig(config, expectedAppUrl) {
  const errors = [];
  const expected = normalizeUrl(expectedAppUrl);
  const actual = normalizeUrl(config?.site_url);

  if (!expected) errors.push("PUBLIC_APP_URL must be a valid absolute URL");
  if (!actual || actual !== expected) errors.push("Supabase Auth site_url must match PUBLIC_APP_URL");
  if (config?.disable_signup === true) errors.push("Public email/password sign-up is disabled");
  if (config?.mailer_autoconfirm !== false) {
    errors.push("Email confirmation must remain enabled for production");
  }
  if (!String(config?.smtp_host || "").trim()) errors.push("Custom SMTP host is missing");
  if (!Number.isInteger(Number(config?.smtp_port)) || Number(config.smtp_port) <= 0) {
    errors.push("Custom SMTP port is missing or invalid");
  }
  if (!String(config?.smtp_user || "").trim()) errors.push("Custom SMTP username is missing");
  if (!String(config?.smtp_admin_email || "").trim()) errors.push("SMTP sender email is missing");

  return errors;
}

async function fetchProductionAuthConfig({ projectId, accessToken, fetchImpl = globalThis.fetch }) {
  if (!/^[a-z]{20}$/.test(String(projectId || ""))) {
    throw new Error("SUPABASE_PROJECT_ID must be a 20-letter project ref");
  }
  if (!String(accessToken || "").trim()) throw new Error("SUPABASE_ACCESS_TOKEN is required");
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required");

  const endpoint = MANAGEMENT_API_ORIGIN + "/v1/projects/" + projectId + "/config/auth";
  const response = await fetchImpl(endpoint, {
    headers: {
      Accept: "application/json",
      Authorization: "Bearer " + accessToken,
    },
  });
  if (!response.ok) {
    throw new Error("Supabase Auth config request failed with HTTP " + response.status);
  }
  return response.json();
}

async function main(env = process.env) {
  const config = await fetchProductionAuthConfig({
    projectId: env.SUPABASE_PROJECT_ID,
    accessToken: env.SUPABASE_ACCESS_TOKEN,
  });
  const errors = validateProductionAuthConfig(config, env.PUBLIC_APP_URL);
  if (errors.length) {
    for (const error of errors) console.error("Production Auth gate: " + error);
    process.exitCode = 1;
    return;
  }
  console.log("Production Auth gate: PASS (verified custom SMTP and email confirmation)");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Production Auth gate: " + error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  fetchProductionAuthConfig,
  normalizeUrl,
  validateProductionAuthConfig,
};
