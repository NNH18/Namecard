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
    public_company_contacts: [], model_assessment: "HIGH",
    claims: [
      { fact_key: "summary", value: "Example builds accounting software.", source_url: pageUrl, excerpt: "Example builds accounting software" },
      { fact_key: "industry", value: "Software", source_url: pageUrl, excerpt: "accounting software" },
      { fact_key: "products_services", value: "Accounting", source_url: pageUrl, excerpt: "accounting software" },
      { fact_key: "target_customers", value: "Enterprise banks", source_url: pageUrl, excerpt: "evidence absent from page" },
      { fact_key: "markets", value: "Mars", source_url: "https://unrelated.example/", excerpt: "Example builds accounting software" }
    ]
  }, { companyName: "Example", website: pageUrl, domain: "example.com", pageUrl, pageText, retrievedAt: "2026-09-23T00:00:00Z" });
  assert.equal(result.summary, "Example builds accounting software.");
  assert.deepEqual(result.products_services, ["Accounting"]);
  assert.deepEqual(result.target_customers, []);
  assert.deepEqual(result.markets, []);
  assert.equal(result.headquarters, null);
  assert.equal(result.model_assessment, "HIGH");
  assert.ok(result.evidence.every(item => item.excerpt.length <= 500));
  assert.equal(result.claims.length, 3);
  assert.equal(result.claims.find(item => item.fact_key === "industry").derivation_type, "EXTRACTED");
});

test("each array claim needs its own source excerpt", async () => {
  const { validateEvidenceBackedResearch } = await contract();
  const pageUrl = "https://example.com/";
  const result = validateEvidenceBackedResearch({
    company_name: "Example",
    claims: [
      { fact_key: "industry", value: "Software", source_url: pageUrl, excerpt: "Example is a software company" },
      { fact_key: "industry", value: "Nuclear energy", source_url: pageUrl, excerpt: "Nuclear energy is not on this page" }
    ],
    public_company_contacts: [], model_assessment: "HIGH"
  }, { companyName: "Example", website: pageUrl, domain: "example.com", pageUrl, pageText: "Example is a software company.", retrievedAt: "2026-09-23T00:00:00Z" });
  assert.deepEqual(result.industry, ["Software"]);
  assert.equal(result.claims.length, 1);
  assert.equal(result.evidence[0].claim_id, result.claims[0].claim_id);
});

test("hallucinated generic mailbox and unrelated source URL are rejected", async () => {
  const { validateEvidenceBackedResearch } = await contract();
  const pageUrl = "https://example.com/contact";
  const base = {
    company_name: "Example", claims: [], model_assessment: "MEDIUM"
  };
  const absent = validateEvidenceBackedResearch({ ...base, public_company_contacts: [{ category: "SALES", value: "sales@example.com", label: "Sales", source_url: pageUrl, evidence_excerpt: "Contact our team today" }] }, { companyName: "Example", website: "https://example.com", domain: "example.com", pageUrl, pageText: "Contact our team today", retrievedAt: "2026-09-23T00:00:00Z" });
  assert.deepEqual(absent.public_company_contacts, []);
  const unrelated = validateEvidenceBackedResearch({ ...base, public_company_contacts: [{ category: "SALES", value: "sales@example.com", label: "Sales", source_url: "https://unrelated.example/contact", evidence_excerpt: "Email sales@example.com" }] }, { companyName: "Example", website: "https://example.com", domain: "example.com", pageUrl, pageText: "Email sales@example.com", retrievedAt: "2026-09-23T00:00:00Z" });
  assert.deepEqual(unrelated.public_company_contacts, []);
});
