import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { cleanHtml, CORS_HEADERS, fetchBounded, getAuthenticatedUser, json } from "../_shared/security.ts";
import { RESEARCH_FACT_KEYS, validateEvidenceBackedResearch } from "../_shared/research-contract.mjs";

const CACHE_DAYS = Math.max(1, Math.min(90, Number(Deno.env.get("RESEARCH_CACHE_DAYS") || 30)));
const RATE_LIMIT = Math.max(1, Math.min(100, Number(Deno.env.get("RESEARCH_RATE_LIMIT_PER_HOUR") || 10)));

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function assertConfirmedContact(admin: any, ownerId: string, contactId: string, companyId: string) {
  if (!/^[a-zA-Z0-9_-]{3,160}$/.test(contactId)) throw new Error("CONFIRMED_CONTACT_REQUIRED");
  const { data: contact } = await admin.from("contacts").select("id,draft,lifecycle").eq("owner_id", ownerId).eq("id", contactId).eq("lifecycle", "ACTIVE").eq("draft", false).maybeSingle();
  if (!contact) throw new Error("CONFIRMED_CONTACT_REQUIRED");
  const { data: relationship } = await admin.from("contact_companies").select("id").eq("owner_id", ownerId).eq("contact_id", contactId).eq("company_id", companyId).eq("lifecycle", "ACTIVE").limit(1).maybeSingle();
  if (!relationship) throw new Error("ACTIVE_COMPANY_RELATIONSHIP_REQUIRED");
  const { data: card } = await admin.from("cards").select("id").eq("owner_id", ownerId).eq("contact_id", contactId).eq("review_status", "USER_CONFIRMED").eq("lifecycle", "ACTIVE").limit(1).maybeSingle();
  if (!card) throw new Error("CONFIRMED_CARD_REQUIRED");
}

async function loadCachedResult(admin: any, ownerId: string, research: any, identity: any) {
  const { data: facts } = await admin.from("company_facts").select("id,fact_key,fact_value,derivation_type,verification_status").eq("owner_id", ownerId).eq("research_id", research.id).eq("verification_status", "SUPPORTED");
  const { data: sources } = await admin.from("research_sources").select("id,url,title,retrieved_at,fact_keys").eq("owner_id", ownerId).eq("research_id", research.id);
  const { data: evidence } = await admin.from("research_fact_evidence").select("fact_id,source_id,excerpt,retrieved_at,verification_status").eq("owner_id", ownerId).eq("research_id", research.id).eq("verification_status", "SUPPORTED");
  const factById = new Map<string, any>((facts || []).map((item: any) => [item.id, item]));
  const sourceById = new Map<string, string>((sources || []).map((item: any) => [item.id, item.url]));
  const evidenceRows = (evidence || []).map((item: any) => {
    const fact = factById.get(item.fact_id);
    return { claim_id: item.fact_id, fact_key: fact?.fact_key, source_url: sourceById.get(item.source_id), excerpt: item.excerpt, retrieved_at: item.retrieved_at, derivation_type: fact?.derivation_type || "INFERRED", verification_status: item.verification_status };
  }).filter((item: any) => item.fact_key && item.source_url);
  const valuesFor = (key: string) => (facts || []).filter((item: any) => item.fact_key === key).map((item: any) => item.fact_value);
  const firstFor = (key: string) => valuesFor(key)[0] ?? null;
  const supportedFactIds = new Set(evidenceRows.map((item: any) => item.claim_id));
  const presentCount = (facts || []).length;
  return {
    company_name: identity.company_name,
    official_website: identity.website,
    summary: firstFor("summary") || research.summary || "",
    industry: valuesFor("industry"), products_services: valuesFor("products_services"), target_customers: valuesFor("target_customers"), markets: valuesFor("markets"),
    headquarters: firstFor("headquarters"), company_size: firstFor("company_size"), public_company_contacts: valuesFor("public_company_contacts"),
    verification_status: supportedFactIds.size && supportedFactIds.size >= presentCount ? "SUPPORTED" : supportedFactIds.size ? "PARTIAL" : "UNVERIFIED",
    evidence_coverage: presentCount ? Math.min(100, Math.round((supportedFactIds.size / presentCount) * 100)) : 0,
    researched_at: research.updated_at,
    evidence: evidenceRows,
    sources: (sources || []).map((source: any) => ({ url: source.url, title: source.title, retrieved_at: source.retrieved_at, fact_keys: source.fact_keys || [] })),
    identity: { resolution_id: identity.id, identity_version: identity.identity_version, identity_status: identity.status, domain: identity.domain, company_name: identity.company_name }
  };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = request.headers.get("authorization") || "";
  const accessToken = auth.replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) return json({ error: "AUTH_REQUIRED" }, 401);
  const user = await getAuthenticatedUser(url, anon, accessToken);
  if (!user) return json({ error: "AUTH_REQUIRED" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let activeCacheKey = "";
  try {
    const body = await request.json();
    const force = body?.force === true;
    const tenantCompanyId = String(body?.tenant_company_id || "").trim().slice(0, 160);
    const contactId = String(body?.contact_id || "").trim().slice(0, 160);
    const resolutionId = String(body?.resolution_id || "").trim().slice(0, 160);
    const requestedIdentityVersion = Number(body?.identity_version || 0);
    if (!/^[a-zA-Z0-9_-]{3,160}$/.test(tenantCompanyId)) return json({ error: "TENANT_COMPANY_REQUIRED" }, 422);
    const { data: tenantCompany } = await admin.from("tenant_companies").select("id,name,lifecycle").eq("owner_id", user.id).eq("id", tenantCompanyId).eq("lifecycle", "ACTIVE").maybeSingle();
    if (!tenantCompany) return json({ error: "TENANT_COMPANY_NOT_FOUND" }, 404);
    await assertConfirmedContact(admin, user.id, contactId, tenantCompanyId);
    const { data: resolution } = await admin.from("company_resolution").select("id,company_id,candidate_domain,candidate_website,status,identity_version").eq("owner_id", user.id).eq("id", resolutionId).eq("company_id", tenantCompanyId).maybeSingle();
    if (!resolution || !["SERVER_VERIFIED", "USER_CONFIRMED"].includes(resolution.status)) return json({ status: "unresolved", reason: "COMPANY_IDENTITY_NOT_VERIFIED" }, 422);
    if (Number(resolution.identity_version) !== requestedIdentityVersion) return json({ status: "unresolved", reason: "STALE_COMPANY_IDENTITY" }, 409);
    const identity = { id: resolution.id, company_name: tenantCompany.name, domain: resolution.candidate_domain, website: resolution.candidate_website, status: resolution.status, identity_version: Number(resolution.identity_version) };
    const cacheKey = `${tenantCompanyId}|v${identity.identity_version}|${identity.domain}`;
    activeCacheKey = cacheKey;
    if (!force) {
      const { data: cached } = await admin.from("company_research").select("id,summary,updated_at,expires_at,status").eq("owner_id", user.id).eq("cache_key", cacheKey).eq("status", "COMPLETED").gt("expires_at", new Date().toISOString()).maybeSingle();
      if (cached) return json({ status: "completed", cache: "hit", tenant_company_id: tenantCompanyId, result: await loadCachedResult(admin, user.id, cached, identity) });
    }
    const { data: claim, error: claimError } = await admin.rpc("claim_research_job", { p_owner_id: user.id, p_cache_key: cacheKey, p_force: force });
    if (claimError) throw new Error("JOB_CLAIM_FAILED");
    if (!claim?.claimed) return json({ status: "researching", cache: "coalesced", job_id: claim?.job_id }, 202);
    const now = new Date();
    const { data: quota, error: quotaError } = await admin.rpc("consume_research_quota", { p_owner_id: user.id, p_bucket: "research", p_limit: RATE_LIMIT, p_units: 1 });
    if (quotaError) throw new Error("QUOTA_CHECK_FAILED");
    if (!quota?.allowed) {
      await admin.from("research_jobs").update({ status: "FAILED", error_code: "RATE_LIMITED", updated_at: now.toISOString() }).eq("owner_id", user.id).eq("cache_key", cacheKey);
      return json({ error: "RATE_LIMITED" }, 429);
    }
    const page = await fetchBounded(identity.website);
    const pageText = cleanHtml(page.text);
    const contentHash = await sha256(pageText);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("RESEARCH_PROVIDER_NOT_CONFIGURED");
    const model = Deno.env.get("COMPANY_RESEARCH_MODEL") || Deno.env.get("OPENAI_RESEARCH_MODEL") || "gpt-5-mini";
    const prompt = `Extract only facts directly supported by the supplied official page. Return one claim for each individual value, including each list item. Every claim requires an exact short excerpt copied from this page and the exact supplied URL. Never group supported and unsupported values under one excerpt. Omit unsupported claims. Generic company contacts must appear verbatim in the excerpt; never return a named person's email/direct phone/mobile/Zalo/WhatsApp. Company: ${identity.company_name}\nOfficial URL: ${page.url}\nWebsite text:\n${pageText}`;
    const modelResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input: prompt, text: { format: { type: "json_schema", name: "company_research", strict: true, schema: {
        type: "object", additionalProperties: false,
        required: ["company_name", "claims", "public_company_contacts", "model_assessment"],
        properties: {
          company_name: { type: "string" },
          claims: { type: "array", maxItems: 80, items: { type: "object", additionalProperties: false, required: ["fact_key", "value", "source_url", "excerpt"], properties: { fact_key: { type: "string", enum: RESEARCH_FACT_KEYS.filter((key: string) => key !== "public_company_contacts") }, value: { type: "string", maxLength: 4000 }, source_url: { type: "string" }, excerpt: { type: "string", maxLength: 500 } } } },
          public_company_contacts: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["category", "value", "label", "source_url", "evidence_excerpt"], properties: { category: { type: "string", enum: ["HOTLINE", "SALES", "SUPPORT", "GENERIC_EMAIL", "OFFICE"] }, value: { type: "string" }, label: { type: "string" }, source_url: { type: "string" }, evidence_excerpt: { type: "string", maxLength: 500 } } } },
          model_assessment: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] }
        }
      } } } })
    });
    if (!modelResponse.ok) throw new Error(`MODEL_${modelResponse.status}`);
    const modelBody = await modelResponse.json();
    const rawText = modelBody.output_text || modelBody.output?.flatMap((o: any) => o.content || []).find((c: any) => c.type === "output_text")?.text;
    const result: any = validateEvidenceBackedResearch(JSON.parse(rawText), { companyName: identity.company_name, website: identity.website, domain: identity.domain, pageUrl: page.url, pageText, retrievedAt: now.toISOString() });
    if (!result.evidence.length) throw new Error("NO_SUPPORTED_FACTS");
    const researchId = crypto.randomUUID();
    const expiresAt = new Date(now.getTime() + CACHE_DAYS * 86400000).toISOString();
    const sourceId = crypto.randomUUID();
    const factIdByClaim = new Map<string, string>();
    const factRows = result.claims.map((claim: any) => {
      const id = crypto.randomUUID();
      factIdByClaim.set(claim.claim_id, id);
      return { id, fact_key: claim.fact_key, fact_value: claim.value, derivation_type: claim.derivation_type, verification_status: claim.verification_status };
    });
    const evidenceRows = result.evidence.map((item: any) => ({ id: crypto.randomUUID(), fact_id: factIdByClaim.get(item.claim_id), source_id: sourceId, excerpt: item.excerpt, content_hash: contentHash, retrieved_at: item.retrieved_at, verification_status: item.verification_status }));
    const supportedKeys: string[] = [...new Set<string>(result.claims.map((item: any) => String(item.fact_key)))];
    const { data: savedId, error: persistError } = await admin.rpc("persist_company_research_bundle", {
      p_owner_id: user.id,
      p_research: { id: researchId, company_id: tenantCompanyId, domain: identity.domain, summary: result.summary, cache_key: cacheKey, expires_at: expiresAt, resolution_id: identity.id, identity_version: identity.identity_version, identity_status: identity.status, action: force ? "RESEARCH_REFRESH" : "RESEARCH_CREATE" },
      p_sources: [{ id: sourceId, url: page.url, title: identity.company_name, retrieved_at: now.toISOString(), fact_keys: supportedKeys }],
      p_facts: factRows,
      p_evidence: evidenceRows
    });
    if (persistError || !savedId) throw new Error("RESEARCH_BUNDLE_SAVE_FAILED");
    const sources = [{ url: page.url, title: identity.company_name, retrieved_at: now.toISOString(), fact_keys: supportedKeys }];
    return json({ status: "completed", cache: "miss", tenant_company_id: tenantCompanyId, result: { ...result, sources, identity: { resolution_id: identity.id, identity_version: identity.identity_version, identity_status: identity.status, domain: identity.domain, company_name: identity.company_name } } });
  } catch (error) {
    if (activeCacheKey) await admin.from("research_jobs").update({ status: "FAILED", error_code: error instanceof Error ? error.message.slice(0, 100) : "RESEARCH_FAILED", updated_at: new Date().toISOString() }).eq("owner_id", user.id).eq("cache_key", activeCacheKey);
    return json({ error: error instanceof Error ? error.message : "RESEARCH_FAILED" }, 422);
  }
});
