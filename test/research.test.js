const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");
const resolver = require("../lib/company-resolver.js");
const { ResearchManager, validateResearchOutput, minimalResearchInput, isAutoResearchEligible } = require("../lib/company-research.js");

const retrievedAt = "2026-09-20T00:00:00.000Z";
const source = { url: "https://example.com", title: "Example", retrieved_at: retrievedAt, fact_keys: ["summary", "industry", "public_company_contacts"] };
const result = {
  company_name: "Example", official_website: "https://example.com", summary: "Example builds software.",
  industry: ["Software"], products_services: [], target_customers: [], markets: [], headquarters: null, company_size: null,
  public_company_contacts: [{ category: "SALES", value: "sales@example.com", label: "Sales", source_url: source.url, evidence_excerpt: "Contact sales@example.com for sales." }],
  verification_status: "SUPPORTED", evidence_coverage: 100, researched_at: retrievedAt, sources: [source],
  evidence: [
    { fact_key: "summary", source_url: source.url, excerpt: "Example builds software.", retrieved_at: retrievedAt },
    { fact_key: "industry", source_url: source.url, excerpt: "Software company", retrieved_at: retrievedAt },
    { fact_key: "public_company_contacts", source_url: source.url, excerpt: "Contact sales@example.com for sales.", retrieved_at: retrievedAt }
  ],
  identity: { resolution_id: "resolution_company_123", identity_version: 2, identity_status: "SERVER_VERIFIED", domain: "example.com", company_name: "Example" }
};
const resolution = { status: "resolved", identity_status: "SERVER_VERIFIED", resolution_id: "resolution_company_123", identity_version: 2, candidate: { company_name: "Example", domain: "example.com", website: "https://example.com/" } };
const input = { contactId: "contact_123", tenantCompanyId: "company_123", companyName: "Example", website: "example.com" };

test("research resolves server identity, coalesces requests and caches identity-bound output", async () => {
  const db = await new MemoryLocalDb().open(); let researchCalls = 0;
  const client = { invoke: async (name) => name === "company-resolver" ? resolution : (researchCalls += 1, { tenant_company_id: "company_123", result }) };
  const manager = new ResearchManager({ db, client, resolver, getOwnerId: () => "owner_one", now: () => Date.parse("2026-09-20T01:00:00Z") });
  const [a, b] = await Promise.all([manager.enqueue(input), manager.enqueue(input)]);
  assert.equal(a.status, "completed"); assert.equal(b.status, "completed"); assert.equal(researchCalls, 1);
  await manager.enqueue(input); assert.equal(researchCalls, 1);
  assert.ok(await db.getResearch("owner_one", "company_123|v2|example.com"));
});

test("research validation rejects unsupported URLs and missing evidence bindings", () => {
  assert.throws(() => validateResearchOutput({ ...result, official_website: "file:///etc/passwd" }), /official_website/);
  assert.throws(() => validateResearchOutput({ ...result, evidence: [{ ...result.evidence[0], source_url: "https://unrelated.example" }] }), /Fact evidence/);
});

test("resolver keeps website and business-email domains as candidates, not verified identity", () => {
  assert.equal(resolver.resolveCompany({ companyName: "Common Trading" }).status, "unresolved");
  assert.equal(resolver.resolveCompany({ companyName: "Common Trading", businessEmail: "person@gmail.com" }).reason, "free_email_is_not_company_evidence");
  assert.equal(resolver.resolveCompany({ companyName: "Example", businessEmail: "hello@example.com" }).status, "candidate");
  assert.equal(resolver.resolveCompany({ companyName: "Example", website: "example.com" }).identity_status, "CANDIDATE");
});

test("research input sends confirmed contact, tenant company and domain without personal mailbox", () => {
  const minimized = minimalResearchInput({ contactId: "contact_123", tenantCompanyId: "company_123", companyName: "Example", website: "example.com", email: "john.nguyen@example.com", address: "City", note: "private", phone: "0900", rawOcr: "private" });
  assert.deepEqual(Object.keys(minimized), ["contact_id", "tenant_company_id", "company_name", "website", "business_email_domain", "address"]);
  assert.equal(minimized.contact_id, "contact_123"); assert.equal(minimized.business_email_domain, "example.com");
  assert.equal(JSON.stringify(minimized).includes("john.nguyen"), false); assert.equal(JSON.stringify(minimized).includes("private"), false);
});

test("client validation rejects named contacts and requires evidence for generic company contacts", () => {
  const named = { ...result.public_company_contacts[0], value: "john.nguyen@example.com", label: "CEO John Nguyen" };
  assert.throws(() => validateResearchOutput({ ...result, public_company_contacts: [named] }), /public_company_contacts/);
  assert.throws(() => validateResearchOutput({ ...result, public_company_contacts: [{ ...result.public_company_contacts[0], evidence_excerpt: "" }] }), /public_company_contacts/);
  assert.equal(validateResearchOutput(result).public_company_contacts.length, 1);
});

test("draft or unconfirmed scans never qualify for automatic research", () => {
  const contact = { id: "contact_1", lifecycle: "ACTIVE", draft: true, relationships: [{ id: "rel_1", companyId: "company_1", company: "Example", status: "ACTIVE", primary: true }] };
  const cards = [{ id: "card_1", contactId: "contact_1", lifecycle: "ACTIVE", reviewStatus: "UNCONFIRMED" }];
  assert.equal(isAutoResearchEligible({ contact, cards }).reason, "CONTACT_CONFIRMATION_REQUIRED");
  contact.draft = false;
  assert.equal(isAutoResearchEligible({ contact, cards }).reason, "CONFIRMED_CARD_REQUIRED");
  cards[0].reviewStatus = "USER_CONFIRMED";
  assert.equal(isAutoResearchEligible({ contact, cards }).eligible, true);
});

test("research exposes candidate, unresolved and failed states without fake completion", async () => {
  const db = await new MemoryLocalDb().open();
  const candidateManager = new ResearchManager({ db, client: { invoke: async () => ({ status: "candidate", reason: "COMPANY_IDENTITY_NOT_PROVEN", candidate: resolution.candidate }) }, resolver, getOwnerId: () => "owner_one" });
  assert.equal((await candidateManager.enqueue(input)).status, "candidate");
  assert.equal((await candidateManager.enqueue({ ...input, website: "", companyName: "Ambiguous" })).status, "unresolved");
  const failedManager = new ResearchManager({ db, client: { invoke: async () => { throw Object.assign(new Error("timeout"), { code: "TIMEOUT" }); } }, resolver, getOwnerId: () => "owner_one" });
  const failed = await failedManager.enqueue(input);
  assert.equal(failed.status, "failed"); assert.equal(failed.reason, "TIMEOUT");
});

test("late research response cannot update a different account", async () => {
  const db = await new MemoryLocalDb().open(); let owner = "owner_one"; let epoch = 1; let resolveResearch;
  const manager = new ResearchManager({ db, client: { invoke: (name) => name === "company-resolver" ? Promise.resolve(resolution) : new Promise(resolve => { resolveResearch = resolve; }) }, resolver, getOwnerId: () => owner, getEpoch: () => epoch });
  const pending = manager.enqueue(input);
  await new Promise(resolve => setImmediate(resolve)); owner = "owner_two"; epoch = 2; resolveResearch({ tenant_company_id: "company_123", result });
  assert.equal((await pending).reason, "ACCOUNT_CHANGED");
  assert.equal(await db.getResearch("owner_one", "company_123|v2|example.com"), null);
});

test("research request uses server resolution and preserves existing TenantCompany/contact IDs", async () => {
  const db = await new MemoryLocalDb().open(); const bodies = [];
  const manager = new ResearchManager({ db, client: { invoke: async (name, payload) => { bodies.push({ name, payload }); return name === "company-resolver" ? resolution : { tenant_company_id: "company_123", result }; } }, resolver, getOwnerId: () => "owner_one" });
  await manager.enqueue(input);
  const researchBody = bodies.find(item => item.name === "company-research").payload;
  assert.equal(researchBody.tenant_company_id, "company_123"); assert.equal(researchBody.contact_id, "contact_123");
  assert.equal(researchBody.resolution_id, "resolution_company_123"); assert.equal(researchBody.identity_version, 2);
  assert.equal(Object.hasOwn(researchBody, "candidate"), false);
});

test("manual confirmation is explicit in resolver request", async () => {
  const db = await new MemoryLocalDb().open(); let resolverBody;
  const manager = new ResearchManager({ db, client: { invoke: async (name, payload) => { if (name === "company-resolver") { resolverBody = payload; return resolution; } return { tenant_company_id: "company_123", result }; } }, resolver, getOwnerId: () => "owner_one" });
  await manager.enqueue(input, { manual: true, confirmIdentity: true });
  assert.equal(resolverBody.confirm_identity, true);
});
