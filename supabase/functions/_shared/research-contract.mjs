const CONTACT_CATEGORIES = new Set(["HOTLINE", "SALES", "SUPPORT", "GENERIC_EMAIL", "OFFICE"]);
const GENERIC_MAILBOXES = new Set(["info", "hello", "contact", "sales", "support", "help", "office", "admin", "customer", "customerservice", "service"]);
const PERSONAL_LABEL = /\b(?:ceo|founder|director|manager|mr|mrs|ms|dr|mobile|personal|zalo|whatsapp)\b/i;
const COMPANY_STOP_WORDS = new Set(["company", "limited", "ltd", "llc", "corp", "corporation", "inc", "jsc", "co", "the", "vietnam", "viet", "nam", "cong", "ty", "tnhh", "co", "phan"]);
const FACT_KEYS = ["summary", "industry", "products_services", "target_customers", "markets", "headquarters", "company_size", "public_company_contacts"];

export function normalizeEvidenceText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9@+.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function boundedString(value, max) {
  return String(value || "").trim().slice(0, max);
}

function sameFetchedSource(sourceUrl, fetchedUrl) {
  try {
    const source = new URL(sourceUrl);
    const fetched = new URL(fetchedUrl);
    source.hash = "";
    fetched.hash = "";
    return source.protocol === "https:" && source.origin === fetched.origin && source.pathname.replace(/\/$/, "") === fetched.pathname.replace(/\/$/, "");
  } catch {
    return false;
  }
}

function excerptOccurs(excerpt, pageText) {
  const needle = normalizeEvidenceText(excerpt);
  return needle.length >= 8 && normalizeEvidenceText(pageText).includes(needle);
}

function companyTokens(companyName) {
  return normalizeEvidenceText(companyName).split(" ").filter(token => token.length >= 3 && !COMPANY_STOP_WORDS.has(token));
}

function tokenCoverage(tokens, text) {
  if (!tokens.length) return 0;
  const words = new Set(normalizeEvidenceText(text).split(" "));
  return tokens.filter(token => words.has(token)).length / tokens.length;
}

export function verifyCompanyIdentity({ companyName, address = "", website, pageUrl, html = "", pageText = "" }) {
  const name = normalizeEvidenceText(companyName);
  const tokens = companyTokens(companyName);
  const title = boundedString(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 500);
  const headings = [...String(html).matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].slice(0, 3).map(match => boundedString(match[1].replace(/<[^>]+>/g, " "), 500));
  const structuredNames = [...String(html).matchAll(/"(?:name|legalName)"\s*:\s*"([^"]{2,300})"/gi)].slice(0, 10).map(match => match[1]);
  const prominent = [title, ...headings, ...structuredNames].filter(Boolean).join(" ");
  const prominentNormalized = normalizeEvidenceText(prominent);
  const bodyNormalized = normalizeEvidenceText(pageText);
  const fullNameProminent = name.length >= 3 && prominentNormalized.includes(name);
  const fullNameBody = name.length >= 3 && bodyNormalized.includes(name);
  const prominentCoverage = tokenCoverage(tokens, prominent);
  const bodyCoverage = tokenCoverage(tokens, pageText);
  const addressTokens = normalizeEvidenceText(address).split(" ").filter(token => token.length >= 4);
  const addressCoverage = addressTokens.length ? tokenCoverage(addressTokens, pageText) : 1;
  const distinctive = tokens.length >= 2 || tokens.some(token => token.length >= 5);
  const nameSupported = fullNameProminent || (distinctive && prominentCoverage >= 0.8) || (fullNameBody && distinctive && bodyCoverage >= 0.8 && addressCoverage >= 0.5);
  let sameDomain = false;
  try {
    const expected = new URL(website).hostname.replace(/^www\./, "");
    const actual = new URL(pageUrl).hostname.replace(/^www\./, "");
    sameDomain = actual === expected || actual.endsWith(`.${expected}`);
  } catch { /* Candidate validation reports malformed URLs before this function. */ }
  const excerpt = boundedString([title, ...headings].find(item => normalizeEvidenceText(item).includes(name)) || title || headings[0] || "", 500);
  return {
    verified: Boolean(sameDomain && nameSupported),
    reason: !sameDomain ? "FETCHED_DOMAIN_MISMATCH" : nameSupported ? "OFFICIAL_SITE_IDENTITY_MATCH" : "COMPANY_IDENTITY_NOT_PROVEN",
    evidence: excerpt ? [{ type: "official_site_identity", source_url: pageUrl, excerpt }] : [],
    metrics: { prominent_name_match: fullNameProminent, name_token_coverage: Number(Math.max(prominentCoverage, bodyCoverage).toFixed(2)), address_token_coverage: Number(addressCoverage.toFixed(2)) }
  };
}

function validatePublicContact(raw, { domain, pageUrl, pageText }) {
  if (!raw || typeof raw !== "object") return null;
  const category = boundedString(raw.category, 40).toUpperCase();
  const value = boundedString(raw.value, 320);
  const label = boundedString(raw.label, 160);
  const sourceUrl = boundedString(raw.source_url || pageUrl, 1000);
  const excerpt = boundedString(raw.evidence_excerpt, 500);
  if (!CONTACT_CATEGORIES.has(category) || !value || !label || PERSONAL_LABEL.test(label)) return null;
  if (!sameFetchedSource(sourceUrl, pageUrl) || !excerptOccurs(excerpt, pageText) || !normalizeEvidenceText(pageText).includes(normalizeEvidenceText(value))) return null;
  if (value.includes("@")) {
    const [mailboxRaw, domainRaw] = value.toLowerCase().split("@");
    const mailbox = mailboxRaw?.replace(/[^a-z0-9]/g, "");
    const emailDomain = domainRaw?.replace(/^www\./, "");
    if (!["GENERIC_EMAIL", "SALES", "SUPPORT"].includes(category) || !GENERIC_MAILBOXES.has(mailbox) || emailDomain !== domain) return null;
  } else if (category === "GENERIC_EMAIL" || !/^\+?[0-9][0-9\s().-]{6,20}$/.test(value)) return null;
  return { category, value, label, source_url: sourceUrl, evidence_excerpt: excerpt };
}

export function validateEvidenceBackedResearch(value, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("MODEL_SCHEMA_INVALID");
  const pageUrl = context.pageUrl;
  const pageText = context.pageText;
  const retrievedAt = context.retrievedAt;
  const evidenceRows = Array.isArray(value.fact_evidence) ? value.fact_evidence : [];
  const evidenceByKey = new Map();
  for (const raw of evidenceRows.slice(0, 80)) {
    const key = boundedString(raw?.fact_key, 80);
    const sourceUrl = boundedString(raw?.source_url, 1000);
    const excerpt = boundedString(raw?.excerpt, 500);
    if (!FACT_KEYS.includes(key) || !sameFetchedSource(sourceUrl, pageUrl) || !excerptOccurs(excerpt, pageText)) continue;
    const rows = evidenceByKey.get(key) || [];
    rows.push({ fact_key: key, source_url: sourceUrl, excerpt, retrieved_at: retrievedAt });
    evidenceByKey.set(key, rows);
  }

  const arrays = ["industry", "products_services", "target_customers", "markets"];
  const result = {
    company_name: boundedString(context.companyName, 300),
    official_website: context.website,
    summary: evidenceByKey.has("summary") ? boundedString(value.summary, 4000) : "",
    headquarters: evidenceByKey.has("headquarters") && value.headquarters ? boundedString(value.headquarters, 500) : null,
    company_size: evidenceByKey.has("company_size") && value.company_size ? boundedString(value.company_size, 100) : null
  };
  for (const key of arrays) {
    const items = Array.isArray(value[key]) ? value[key].filter(item => typeof item === "string").map(item => boundedString(item, 500)).filter(Boolean).slice(0, 30) : [];
    result[key] = evidenceByKey.has(key) ? items : [];
  }
  const contacts = (Array.isArray(value.public_company_contacts) ? value.public_company_contacts : [])
    .slice(0, 20)
    .map(item => validatePublicContact(item, { domain: context.domain, pageUrl, pageText }))
    .filter(Boolean);
  result.public_company_contacts = contacts;
  if (contacts.length) {
    const rows = contacts.map(item => ({ fact_key: "public_company_contacts", source_url: item.source_url, excerpt: item.evidence_excerpt, retrieved_at: retrievedAt }));
    evidenceByKey.set("public_company_contacts", rows);
  } else {
    evidenceByKey.delete("public_company_contacts");
  }

  const presentKeys = FACT_KEYS.filter(key => key === "summary" ? Boolean(result.summary) : Array.isArray(result[key]) ? result[key].length > 0 : Boolean(result[key]));
  const supportedKeys = presentKeys.filter(key => evidenceByKey.has(key));
  const evidence = supportedKeys.flatMap(key => evidenceByKey.get(key) || []);
  result.evidence = evidence;
  result.evidence_coverage = presentKeys.length ? Math.round((supportedKeys.length / presentKeys.length) * 100) : 0;
  result.verification_status = supportedKeys.length === 0 ? "UNVERIFIED" : supportedKeys.length === presentKeys.length ? "SUPPORTED" : "PARTIAL";
  result.model_assessment = ["LOW", "MEDIUM", "HIGH"].includes(String(value.model_assessment || "").toUpperCase()) ? String(value.model_assessment).toUpperCase() : "UNSPECIFIED";
  result.researched_at = retrievedAt;
  return result;
}

export const RESEARCH_FACT_KEYS = Object.freeze([...FACT_KEYS]);
