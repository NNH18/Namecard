const test = require("node:test");
const assert = require("node:assert/strict");

async function contract() {
  return import("../supabase/functions/_shared/research-contract.mjs");
}

test("wrong OCR domain cannot become server-verified for another TenantCompany", async () => {
  const { verifyCompanyIdentity } = await contract();
  const result = verifyCompanyIdentity({
    companyName: "ABC Logistics",
    website: "https://unrelated-company.example/",
    pageUrl: "https://unrelated-company.example/",
    html: "<title>Unrelated Company</title><h1>Unrelated Company</h1>",
    pageText: "Unrelated Company sells furniture."
  });
  assert.equal(result.verified, false);
  assert.equal(result.reason, "COMPANY_IDENTITY_NOT_PROVEN");
});

test("official page identity requires matching company evidence", async () => {
  const { verifyCompanyIdentity } = await contract();
  const result = verifyCompanyIdentity({
    companyName: "All Made Viet",
    website: "https://allmadeviet.example/",
    pageUrl: "https://allmadeviet.example/",
    html: "<title>All Made Viet — Connecting buyers and sellers</title><h1>All Made Viet</h1>",
    pageText: "All Made Viet connects buyers and sellers globally."
  });
  assert.equal(result.verified, true);
  assert.ok(result.evidence[0].excerpt.includes("All Made Viet"));
});

test("unsupported model facts are dropped while exact excerpts remain auditable", async () => {
  const { validateEvidenceBackedResearch } = await contract();
  const pageUrl = "https://example.com/";
  const pageText = "Example builds accounting software for small businesses. Contact sales@example.com for sales.";
  const result = validateEvidenceBackedResearch({
    summary: "Example builds accounting software.", industry: ["Software"], products_services: ["Accounting"], target_customers: ["Enterprise banks"], markets: ["Mars"], headquarters: "Paris", company_size: "10,000",
    public_company_contacts: [], model_assessment: "HIGH",
    fact_evidence: [
      { fact_key: "summary", source_url: pageUrl, excerpt: "Example builds accounting software" },
      { fact_key: "industry", source_url: pageUrl, excerpt: "accounting software" },
      { fact_key: "products_services", source_url: pageUrl, excerpt: "accounting software" }
    ]
  }, { companyName: "Example", website: pageUrl, domain: "example.com", pageUrl, pageText, retrievedAt: "2026-09-23T00:00:00Z" });
  assert.equal(result.summary, "Example builds accounting software.");
  assert.deepEqual(result.products_services, ["Accounting"]);
  assert.deepEqual(result.target_customers, []);
  assert.deepEqual(result.markets, []);
  assert.equal(result.headquarters, null);
  assert.equal(result.model_assessment, "HIGH");
  assert.ok(result.evidence.every(item => item.excerpt.length <= 500));
});

test("hallucinated generic mailbox and unrelated source URL are rejected", async () => {
  const { validateEvidenceBackedResearch } = await contract();
  const pageUrl = "https://example.com/contact";
  const base = {
    summary: "", industry: [], products_services: [], target_customers: [], markets: [], headquarters: null, company_size: null, model_assessment: "MEDIUM", fact_evidence: []
  };
  const absent = validateEvidenceBackedResearch({ ...base, public_company_contacts: [{ category: "SALES", value: "sales@example.com", label: "Sales", source_url: pageUrl, evidence_excerpt: "Contact our team today" }] }, { companyName: "Example", website: "https://example.com", domain: "example.com", pageUrl, pageText: "Contact our team today", retrievedAt: "2026-09-23T00:00:00Z" });
  assert.deepEqual(absent.public_company_contacts, []);
  const unrelated = validateEvidenceBackedResearch({ ...base, public_company_contacts: [{ category: "SALES", value: "sales@example.com", label: "Sales", source_url: "https://unrelated.example/contact", evidence_excerpt: "Email sales@example.com" }] }, { companyName: "Example", website: "https://example.com", domain: "example.com", pageUrl, pageText: "Email sales@example.com", retrievedAt: "2026-09-23T00:00:00Z" });
  assert.deepEqual(unrelated.public_company_contacts, []);
});
