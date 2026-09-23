import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { cleanHtml, CORS_HEADERS, fetchBounded, json } from "../_shared/security.ts";
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
  const { data: facts } = await admin.from("company_facts").select("id,fact_key,fact_value,verification_status").eq("owner_id", ownerId).eq("research_id", research.id).eq("verification_status", "SUPPORTED");
  const { data: sources } = await admin.from("research_sources").select("id,url,title,retrieved_at,fact_keys").eq("owner_id", ownerId).eq("research_id", research.id);
  const { data: evidence } = await admin.from("research_fact_evidence").select("fact_id,source_id,excerpt,retrieved_at,verification_status").eq("owner_id", ownerId).eq("research_id", research.id).eq("verification_status", "SUPPORTED");
  const mapped = Object.fromEntries((facts || []).map((item: any) => [item.fact_key, item.fact_value]));
  const factKeyById = new Map((facts || []).map((item: any) => [item.id, item.fact_key]));
  const sourceById = new Map((sources || []).map((item: any) => [item.id, item.url]));
  const evidenceRows = (evidence || []).map((item: any) => ({ fact_key: factKeyById.get(item.fact_id), source_url: sourceById.get(item.source_id), excerpt: item.excerpt, retrieved_at: item.retrieved_at })).filter((item: any) => item.fact_key && item.source_url);
  const presentCount = RESEARCH_FACT_KEYS.filter((key: string) => key === "summary" ? Boolean(research.summary) : Array.isArray(mapped[key]) ? mapped[key].length : Boolean(mapped[key])).length;
  return {
    company_name: identity.company_name,
    official_website: identity.website,
    summary: research.summary || "",
    industry: mapped.industry || [], products_services: mapped.products_services || [], target_customers: mapped.target_customers || [], markets: mapped.markets || [],
    headquarters: mapped.headquarters || null, company_size: mapped.company_size || null, public_company_contacts: mapped.public_company_contacts || [],
    verification_status: evidenceRows.length && evidenceRows.length >= presentCount ? "SUPPORTED" : evidenceRows.length ? "PARTIAL" : "UNVERIFIED",
    evidence_coverage: presentCount ? Math.min(100, Math.round((new Set(evidenceRows.map((item: any) => item.fact_key)).size / presentCount) * 100)) : 0,
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
  const userClient = createClient(url, anon, { global: { headers: { authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
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
    const prompt = `Extract only facts directly supported by the supplied official page. Every non-empty fact requires an exact short excerpt copied from this page and the exact supplied URL. Omit unsupported facts. Generic company contacts must appear verbatim in the excerpt; never return a named person's email/direct phone/mobile/Zalo/WhatsApp. Company: ${identity.company_name}\nOfficial URL: ${page.url}\nWebsite text:\n${pageText}`;
    const modelResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input: prompt, text: { format: { type: "json_schema", name: "company_research", strict: true, schema: {
        type: "object", additionalProperties: false,
        required: ["company_name", "summary", "industry", "products_services", "target_customers", "markets", "headquarters", "company_size", "public_company_contacts", "fact_evidence", "model_assessment"],
        properties: {
          company_name: { type: "string" }, summary: { type: "string" }, industry: { type: "array", items: { type: "string" } }, products_services: { type: "array", items: { type: "string" } }, target_customers: { type: "array", items: { type: "string" } }, markets: { type: "array", items: { type: "string" } }, headquarters: { type: ["string", "null"] }, company_size: { type: ["string", "null"] },
          public_company_contacts: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["category", "value", "label", "source_url", "evidence_excerpt"], properties: { category: { type: "string", enum: ["HOTLINE", "SALES", "SUPPORT", "GENERIC_EMAIL", "OFFICE"] }, value: { type: "string" }, label: { type: "string" }, source_url: { type: "string" }, evidence_excerpt: { type: "string", maxLength: 500 } } } },
          fact_evidence: { type: "array", maxItems: 80, items: { type: "object", additionalProperties: false, required: ["fact_key", "source_url", "excerpt"], properties: { fact_key: { type: "string", enum: RESEARCH_FACT_KEYS }, source_url: { type: "string" }, excerpt: { type: "string", maxLength: 500 } } } },
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
    await admin.from("company_research").upsert({ owner_id: user.id, id: researchId, company_id: tenantCompanyId, domain: identity.domain, status: "COMPLETED", summary: result.summary, confidence: null, cache_key: cacheKey, expires_at: expiresAt, resolution_id: identity.id, identity_version: identity.identity_version, identity_status: identity.status }, { onConflict: "owner_id,cache_key" });
    const { data: saved } = await admin.from("company_research").select("id").eq("owner_id", user.id).eq("cache_key", cacheKey).single();
    const savedId = saved!.id;
    await admin.from("research_fact_evidence").delete().eq("owner_id", user.id).eq("research_id", savedId);
    await admin.from("company_facts").delete().eq("owner_id", user.id).eq("research_id", savedId);
    await admin.from("research_sources").delete().eq("owner_id", user.id).eq("research_id", savedId);
    const sourceId = crypto.randomUUID();
    const supportedKeys: string[] = [...new Set<string>(result.evidence.map((item: any) => String(item.fact_key)))];
    await admin.from("research_sources").insert({ owner_id: user.id, id: sourceId, research_id: savedId, url: page.url, title: identity.company_name, retrieved_at: now.toISOString(), fact_keys: supportedKeys });
    const values: Record<string, unknown> = { summary: result.summary, industry: result.industry, products_services: result.products_services, target_customers: result.target_customers, markets: result.markets, headquarters: result.headquarters, company_size: result.company_size, public_company_contacts: result.public_company_contacts };
    const factRows = supportedKeys.filter((key: string) => key !== "summary" || result.summary).map((key: string) => ({ owner_id: user.id, id: crypto.randomUUID(), research_id: savedId, fact_key: key, fact_value: values[key], confidence: null, verification_status: "SUPPORTED" }));
    const { data: insertedFacts, error: factsError } = await admin.from("company_facts").insert(factRows).select("id,fact_key");
    if (factsError) throw new Error("FACT_SAVE_FAILED");
    const factIdByKey = new Map((insertedFacts || []).map((item: any) => [item.fact_key, item.id]));
    const evidenceRows = result.evidence.filter((item: any) => factIdByKey.has(item.fact_key)).map((item: any) => ({ owner_id: user.id, id: crypto.randomUUID(), research_id: savedId, fact_id: factIdByKey.get(item.fact_key), source_id: sourceId, excerpt: item.excerpt, content_hash: contentHash, retrieved_at: item.retrieved_at, verification_status: "SUPPORTED" }));
    if (evidenceRows.length) await admin.from("research_fact_evidence").insert(evidenceRows);
    await admin.from("audit_log").insert({ owner_id: user.id, actor_id: user.id, action: force ? "RESEARCH_REFRESH" : "RESEARCH_CREATE", object_type: "company_research", object_id: savedId, metadata: { domain: identity.domain, identity_version: identity.identity_version, supported_fact_count: supportedKeys.length } });
    await admin.from("research_jobs").update({ status: "COMPLETED", lease_until: now.toISOString(), updated_at: new Date().toISOString() }).eq("owner_id", user.id).eq("cache_key", cacheKey);
    const sources = [{ url: page.url, title: identity.company_name, retrieved_at: now.toISOString(), fact_keys: supportedKeys }];
    return json({ status: "completed", cache: "miss", tenant_company_id: tenantCompanyId, result: { ...result, sources, identity: { resolution_id: identity.id, identity_version: identity.identity_version, identity_status: identity.status, domain: identity.domain, company_name: identity.company_name } } });
  } catch (error) {
    if (activeCacheKey) await admin.from("research_jobs").update({ status: "FAILED", error_code: error instanceof Error ? error.message.slice(0, 100) : "RESEARCH_FAILED", updated_at: new Date().toISOString() }).eq("owner_id", user.id).eq("cache_key", activeCacheKey);
    return json({ error: error instanceof Error ? error.message : "RESEARCH_FAILED" }, 422);
  }
});
