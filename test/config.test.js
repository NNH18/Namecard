const test = require("node:test");
const assert = require("node:assert/strict");
const { readConfig } = require("../lib/config.js");
const { SupabaseClient } = require("../lib/supabase.js");

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

test("client blocks direct private-table mutation and permits reads", async () => {
  const requests = [];
  const client = new SupabaseClient({
    url: "https://demo.supabase.co",
    anonKey: "public-anon-key-with-safe-length",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, async text() { return "[]"; } };
    }
  });
  assert.throws(() => client.rest("contacts", { method: "POST", body: {} }), error => error.code === "DIRECT_DML_FORBIDDEN");
  await client.rest("contacts", { query: "select=id" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "GET");
});
test("browser default fetch keeps its global receiver", async () => {
  const originalFetch = globalThis.fetch;
  let receiver;
  globalThis.fetch = async function () {
    receiver = this;
    return { ok: true, status: 200, async text() { return "[]"; } };
  };
  try {
    const client = new SupabaseClient({ url: "https://demo.supabase.co", anonKey: "public-anon-key-with-safe-length" });
    await client.rest("contacts", { query: "select=id" });
    assert.equal(receiver, globalThis);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
