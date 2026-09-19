const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");
const resolver = require("../lib/company-resolver.js");
const { ResearchManager, validateResearchOutput, minimalResearchInput } = require("../lib/company-research.js");

const result = { company_name: "Example", official_website: "https://example.com", summary: "Public summary", industry: ["Software"], products_services: [], target_customers: [], markets: [], public_company_contacts: [], headquarters: null, company_size: null, confidence: 85, researched_at: "2026-09-20T00:00:00.000Z", sources: [{ url: "https://example.com", title: "Example", retrieved_at: "2026-09-20T00:00:00.000Z" }] };

test("research coalesces requests and caches validated output", async () => {
  const db = await new MemoryLocalDb().open(); let calls = 0;
  const manager = new ResearchManager({ db, client: { invoke: async () => { calls += 1; return { result }; } }, resolver, getOwnerId: () => "owner_one", now: () => Date.parse("2026-09-20T01:00:00Z") });
  const input = { tenantCompanyId: "company_123", companyName: "Example", website: "example.com" };
  const [a, b] = await Promise.all([manager.enqueue(input), manager.enqueue(input)]);
  assert.equal(a.status, "completed"); assert.equal(b.status, "completed"); assert.equal(calls, 1);
  await manager.enqueue(input); assert.equal(calls, 1);
});

test("research validation rejects unsupported URLs", () => {
  assert.throws(() => validateResearchOutput({ ...result, official_website: "file:///etc/passwd" }), /official_website/);
});

test("resolver rejects ambiguous names and free email but accepts business domain", () => {
  assert.equal(resolver.resolveCompany({ companyName: "Common Trading" }).status, "unresolved");
  assert.equal(resolver.resolveCompany({ companyName: "Common Trading", businessEmail: "person@gmail.com" }).reason, "free_email_is_not_company_evidence");
  assert.equal(resolver.resolveCompany({ companyName: "Example", businessEmail: "hello@example.com" }).domain, "example.com");
});

test("research input sends tenant company identity and domain without personal mailbox", () => {
  const minimized = minimalResearchInput({ tenantCompanyId: "company_123", companyName: "Example", website: "example.com", email: "john.nguyen@example.com", address: "City", note: "private", phone: "0900", rawOcr: "private" });
  assert.deepEqual(Object.keys(minimized), ["tenant_company_id", "company_name", "website", "business_email_domain", "address"]);
  assert.equal(minimized.business_email_domain, "example.com");
  assert.equal(JSON.stringify(minimized).includes("john.nguyen"), false);
  assert.equal(JSON.stringify(minimized).includes("private"), false);
});

test("public company contact validation rejects named people and allows generic channels", () => {
  const namedEmail = { category: "GENERIC_EMAIL", value: "john.nguyen@example.com", label: "CEO John Nguyen", source_url: "https://example.com/contact" };
  const mobile = { category: "HOTLINE", value: "+84 909 123 456", label: "CEO mobile", source_url: "https://example.com/contact" };
  assert.throws(() => validateResearchOutput({ ...result, public_company_contacts: [namedEmail] }), /public_company_contacts/);
  assert.throws(() => validateResearchOutput({ ...result, public_company_contacts: [mobile] }), /public_company_contacts/);
  const allowed = validateResearchOutput({ ...result, public_company_contacts: [
    { category: "SALES", value: "sales@example.com", label: "Sales", source_url: "https://example.com/contact" },
    { category: "SUPPORT", value: "support@example.com", label: "Support", source_url: "https://example.com/contact" },
    { category: "HOTLINE", value: "+84 28 1234 5678", label: "Company hotline", source_url: "https://example.com/contact" }
  ] });
  assert.equal(allowed.public_company_contacts.length, 3);
});

test("research exposes unresolved and failed states without fake completion", async () => {
  const db = await new MemoryLocalDb().open();
  const manager = new ResearchManager({ db, client: { invoke: async () => { throw Object.assign(new Error("timeout"), { code: "TIMEOUT" }); } }, resolver, getOwnerId: () => "owner_one" });
  assert.equal((await manager.enqueue({ tenantCompanyId: "company_123", companyName: "Ambiguous" })).status, "unresolved");
  const failed = await manager.enqueue({ tenantCompanyId: "company_123", companyName: "Example", website: "example.com" });
  assert.equal(failed.status, "failed"); assert.equal(failed.reason, "TIMEOUT");
});

test("late research response cannot update a different account", async () => {
  const db = await new MemoryLocalDb().open(); let owner = "owner_one"; let epoch = 1; let resolveInvoke;
  const manager = new ResearchManager({ db, client: { invoke: () => new Promise(resolve => { resolveInvoke = resolve; }) }, resolver, getOwnerId: () => owner, getEpoch: () => epoch });
  const pending = manager.enqueue({ tenantCompanyId: "company_123", companyName: "Example", website: "example.com" });
  await new Promise(resolve => setImmediate(resolve)); owner = "owner_two"; epoch = 2; resolveInvoke({ result });
  assert.equal((await pending).reason, "ACCOUNT_CHANGED");
  assert.equal(await db.getResearch("owner_one", "company_123|example.com"), null);
});

test("research request preserves the existing TenantCompany ID", async () => {
  const db = await new MemoryLocalDb().open(); let body;
  const manager = new ResearchManager({ db, client: { invoke: async (_name, payload) => { body = payload; return { result }; } }, resolver, getOwnerId: () => "owner_one" });
  await manager.enqueue({ tenantCompanyId: "company_123", companyName: "Example", website: "example.com" });
  assert.equal(body.tenant_company_id, "company_123");
  assert.equal(JSON.stringify(body).includes("company_example_com"), false);
});
