const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");
const resolver = require("../lib/company-resolver.js");
const { ResearchManager, validateResearchOutput, minimalResearchInput } = require("../lib/company-research.js");

const result = { company_name: "Example", official_website: "https://example.com", summary: "Public summary", industry: ["Software"], products_services: [], target_customers: [], markets: [], public_contacts: [], headquarters: null, company_size: null, confidence: 85, researched_at: "2026-09-20T00:00:00.000Z", sources: [{ url: "https://example.com", title: "Example", retrieved_at: "2026-09-20T00:00:00.000Z" }] };

test("research coalesces requests and caches validated output", async () => {
  const db = await new MemoryLocalDb().open(); let calls = 0;
  const manager = new ResearchManager({ db, client: { invoke: async () => { calls += 1; return { result }; } }, resolver, getOwnerId: () => "owner_one", now: () => Date.parse("2026-09-20T01:00:00Z") });
  const [a, b] = await Promise.all([manager.enqueue({ companyName: "Example", website: "example.com" }), manager.enqueue({ companyName: "Example", website: "example.com" })]);
  assert.equal(a.status, "completed"); assert.equal(b.status, "completed"); assert.equal(calls, 1);
  await manager.enqueue({ companyName: "Example", website: "example.com" }); assert.equal(calls, 1);
});

test("research validation rejects unsupported URLs", () => {
  assert.throws(() => validateResearchOutput({ ...result, official_website: "file:///etc/passwd" }), /official_website/);
});

test("resolver rejects ambiguous names and free email but accepts business domain", () => {
  assert.equal(resolver.resolveCompany({ companyName: "Common Trading" }).status, "unresolved");
  assert.equal(resolver.resolveCompany({ companyName: "Common Trading", businessEmail: "person@gmail.com" }).reason, "free_email_is_not_company_evidence");
  assert.equal(resolver.resolveCompany({ companyName: "Example", businessEmail: "hello@example.com" }).domain, "example.com");
});

test("research input removes contact notes, phone and unrelated private fields", () => {
  const minimized = minimalResearchInput({ companyName: "Example", website: "example.com", email: "hello@example.com", address: "City", note: "private", phone: "0900", rawOcr: "private" });
  assert.deepEqual(Object.keys(minimized), ["company_name", "website", "business_email", "address"]);
  assert.equal(JSON.stringify(minimized).includes("private"), false);
});

test("research exposes unresolved and failed states without fake completion", async () => {
  const db = await new MemoryLocalDb().open();
  const manager = new ResearchManager({ db, client: { invoke: async () => { throw Object.assign(new Error("timeout"), { code: "TIMEOUT" }); } }, resolver, getOwnerId: () => "owner_one" });
  assert.equal((await manager.enqueue({ companyName: "Ambiguous" })).status, "unresolved");
  const failed = await manager.enqueue({ companyName: "Example", website: "example.com" });
  assert.equal(failed.status, "failed"); assert.equal(failed.reason, "TIMEOUT");
});

test("late research response cannot update a different account", async () => {
  const db = await new MemoryLocalDb().open(); let owner = "owner_one"; let epoch = 1; let resolveInvoke;
  const manager = new ResearchManager({ db, client: { invoke: () => new Promise(resolve => { resolveInvoke = resolve; }) }, resolver, getOwnerId: () => owner, getEpoch: () => epoch });
  const pending = manager.enqueue({ companyName: "Example", website: "example.com" });
  await new Promise(resolve => setImmediate(resolve)); owner = "owner_two"; epoch = 2; resolveInvoke({ result });
  assert.equal((await pending).reason, "ACCOUNT_CHANGED");
  assert.equal(await db.getResearch("owner_one", "example.com"), null);
});
