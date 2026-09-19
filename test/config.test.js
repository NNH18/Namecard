const test = require("node:test");
const assert = require("node:assert/strict");
const { readConfig } = require("../lib/config.js");

test("client config rejects partial configuration and server secrets", () => {
  assert.throws(() => readConfig({ SUPABASE_URL: "https://demo.supabase.co" }), /cùng nhau/);
  assert.throws(() => readConfig({ OPENAI_API_KEY: "secret" }), /server-side/);
});

test("client config accepts public Supabase settings", () => {
  const config = readConfig({ SUPABASE_URL: "https://demo.supabase.co/", SUPABASE_ANON_KEY: "public-anon-key-with-safe-length", AUTO_RESEARCH: "false" });
  assert.equal(config.configured, true);
  assert.equal(config.supabaseUrl, "https://demo.supabase.co");
  assert.equal(config.autoResearch, false);
});
