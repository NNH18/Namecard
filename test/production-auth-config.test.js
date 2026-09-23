"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  fetchProductionAuthConfig,
  normalizeUrl,
  validateProductionAuthConfig,
} = require("../scripts/verify-production-auth-config");

const validConfig = {
  site_url: "https://nnh18.github.io/Namecard/",
  disable_signup: false,
  mailer_autoconfirm: false,
  smtp_host: "smtp.example.test",
  smtp_port: 587,
  smtp_user: "bcard",
  smtp_admin_email: "no-reply@example.test",
};

test("production Auth gate accepts confirmed-email signup with custom SMTP", () => {
  assert.deepEqual(
    validateProductionAuthConfig(validConfig, "https://nnh18.github.io/Namecard"),
    [],
  );
  assert.equal(normalizeUrl("https://nnh18.github.io/Namecard"), validConfig.site_url);
});

test("production Auth gate reports every unsafe or incomplete setting", () => {
  const errors = validateProductionAuthConfig(
    {
      site_url: "http://localhost:4173",
      disable_signup: true,
      mailer_autoconfirm: true,
      smtp_host: "",
      smtp_port: 0,
      smtp_user: "",
      smtp_admin_email: "",
    },
    "https://nnh18.github.io/Namecard/",
  );
  assert.deepEqual(errors, [
    "Supabase Auth site_url must match PUBLIC_APP_URL",
    "Public email/password sign-up is disabled",
    "Email confirmation must remain enabled for production",
    "Custom SMTP host is missing",
    "Custom SMTP port is missing or invalid",
    "Custom SMTP username is missing",
    "SMTP sender email is missing",
  ]);
});

test("production Auth fetch sends the management token without exposing it", async () => {
  let request;
  const config = await fetchProductionAuthConfig({
    projectId: "abcdefghijklmnopqrst",
    accessToken: "secret-management-token",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => validConfig };
    },
  });
  assert.equal(request.url, "https://api.supabase.com/v1/projects/abcdefghijklmnopqrst/config/auth");
  assert.equal(request.options.headers.Authorization, "Bearer secret-management-token");
  assert.deepEqual(config, validConfig);
});

test("production Auth fetch reports only the HTTP status on failure", async () => {
  await assert.rejects(
    fetchProductionAuthConfig({
      projectId: "abcdefghijklmnopqrst",
      accessToken: "secret-management-token",
      fetchImpl: async () => ({ ok: false, status: 403 }),
    }),
    /HTTP 403/,
  );
});
