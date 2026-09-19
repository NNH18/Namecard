import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { cleanHtml, CORS_HEADERS, fetchBounded, json, validateCandidate } from "../_shared/security.ts";

const CACHE_DAYS = Math.max(1, Math.min(90, Number(Deno.env.get("RESEARCH_CACHE_DAYS") || 30)));
const RATE_LIMIT = Math.max(1, Math.min(100, Number(Deno.env.get("RESEARCH_RATE_LIMIT_PER_HOUR") || 10)));

function validateModelResult(value: unknown, candidate: { company_name: string; website: string }) {
  if (!value || typeof value !== "object") throw new Error("MODEL_SCHEMA_INVALID");
  const item = value as Record<string, unknown>; const arrays = ["industry", "products_services", "target_customers", "markets", "public_contacts"];
  for (const key of arrays) if (!Array.isArray(item[key]) || !(item[key] as unknown[]).every(v => typeof v === "string" && v.length <= 500)) throw new Error("MODEL_SCHEMA_INVALID");
  const confidence = Number(item.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 100) throw new Error("MODEL_SCHEMA_INVALID");
  return { company_name: String(item.company_name || candidate.company_name).slice(0, 300), official_website: candidate.website, summary: String(item.summary || "").slice(0, 4000), industry: item.industry, products_services: item.products_services, target_customers: item.target_customers, markets: item.markets, headquarters: item.headquarters ? String(item.headquarters).slice(0, 500) : null, company_size: item.company_size ? String(item.company_size).slice(0, 100) : null, public_contacts: item.public_contacts, confidence, researched_at: new Date().toISOString() };
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const url = Deno.env.get("SUPABASE_URL")!; const anon = Deno.env.get("SUPABASE_ANON_KEY")!; const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = request.headers.get("authorization") || "";
  const userClient = createClient(url, anon, { global: { headers: { authorization: auth } } });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "AUTH_REQUIRED" }, 401);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let activeCacheKey = "";
  try {
    const body = await request.json(); const candidate = validateCandidate(body?.candidate); const force = body?.force === true;
    const cacheKey = candidate.domain;
    activeCacheKey = cacheKey;
    if (!force) {
      const { data: cached } = await admin.from("company_research").select("id,company_id,summary,confidence,updated_at,expires_at").eq("owner_id", user.id).eq("cache_key", cacheKey).eq("status", "COMPLETED").gt("expires_at", new Date().toISOString()).maybeSingle();
      if (cached) {
        const { data: facts } = await admin.from("company_facts").select("fact_key,fact_value").eq("owner_id", user.id).eq("research_id", cached.id);
        const { data: sources } = await admin.from("research_sources").select("url,title,retrieved_at,fact_keys").eq("owner_id", user.id).eq("research_id", cached.id);
        const mapped = Object.fromEntries((facts || []).map(item => [item.fact_key, item.fact_value]));
        return json({ status: "completed", cache: "hit", result: { company_name: candidate.company_name, official_website: candidate.website, summary: cached.summary || "", confidence: Number(cached.confidence || 0), researched_at: cached.updated_at, industry: mapped.industry || [], products_services: mapped.products_services || [], target_customers: mapped.target_customers || [], markets: mapped.markets || [], headquarters: mapped.headquarters || null, company_size: mapped.company_size || null, public_contacts: mapped.public_contacts || [], sources: sources || [] } });
      }
    }
    const { data: claim, error: claimError } = await admin.rpc("claim_research_job", { p_owner_id: user.id, p_cache_key: cacheKey, p_force: force });
    if (claimError) throw new Error("JOB_CLAIM_FAILED");
    if (!claim?.claimed) return json({ status: "researching", cache: "coalesced", job_id: claim?.job_id }, 202);
    const now = new Date(); const hourAgo = new Date(now.getTime() - 3600000).toISOString();
    const { data: limit } = await admin.from("research_rate_limits").select("window_started_at,request_count").eq("owner_id", user.id).maybeSingle();
    const count = limit && limit.window_started_at > hourAgo ? Number(limit.request_count) : 0;
    if (count >= RATE_LIMIT) { await admin.from("research_jobs").update({ status: "FAILED", error_code: "RATE_LIMITED", updated_at: now.toISOString() }).eq("owner_id", user.id).eq("cache_key", cacheKey); return json({ error: "RATE_LIMITED" }, 429); }
    await admin.from("research_rate_limits").upsert({ owner_id: user.id, window_started_at: count ? limit.window_started_at : now.toISOString(), request_count: count + 1, updated_at: now.toISOString() });
    const page = await fetchBounded(candidate.website); const pageText = cleanHtml(page.text);
    const apiKey = Deno.env.get("OPENAI_API_KEY"); if (!apiKey) return json({ error: "RESEARCH_PROVIDER_NOT_CONFIGURED" }, 503);
    const model = Deno.env.get("COMPANY_RESEARCH_MODEL") || Deno.env.get("OPENAI_RESEARCH_MODEL") || "gpt-5-mini";
    const prompt = `Return only evidence-backed public company facts from the supplied official website text. Never infer personal data. Company: ${candidate.company_name}\nOfficial URL: ${page.url}\nWebsite text:\n${pageText}`;
    const modelResponse = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model, input: prompt, text: { format: { type: "json_schema", name: "company_research", strict: true, schema: { type: "object", additionalProperties: false, required: ["company_name","summary","industry","products_services","target_customers","markets","headquarters","company_size","public_contacts","confidence"], properties: { company_name: { type: "string" }, summary: { type: "string" }, industry: { type: "array", items: { type: "string" } }, products_services: { type: "array", items: { type: "string" } }, target_customers: { type: "array", items: { type: "string" } }, markets: { type: "array", items: { type: "string" } }, headquarters: { type: ["string","null"] }, company_size: { type: ["string","null"] }, public_contacts: { type: "array", items: { type: "string" } }, confidence: { type: "number", minimum: 0, maximum: 100 } } } } } }) });
    if (!modelResponse.ok) throw new Error(`MODEL_${modelResponse.status}`);
    const modelBody = await modelResponse.json(); const rawText = modelBody.output_text || modelBody.output?.flatMap((o: any) => o.content || []).find((c: any) => c.type === "output_text")?.text;
    const result = validateModelResult(JSON.parse(rawText), candidate); const researchId = crypto.randomUUID(); const companyId = String(body?.company_id || `company_${candidate.domain.replace(/[^a-z0-9]/g, "_")}`).slice(0, 160);
    await admin.from("tenant_companies").upsert({ owner_id: user.id, id: companyId, name: candidate.company_name, website: candidate.website }, { onConflict: "owner_id,id" });
    await admin.from("company_resolution").upsert({ owner_id: user.id, id: `resolution_${candidate.domain.replace(/[^a-z0-9]/g, "_")}`, company_id: companyId, candidate_domain: candidate.domain, candidate_website: candidate.website, confidence: Math.max(0, Math.min(100, Number(body?.candidate?.confidence || 0) * (Number(body?.candidate?.confidence || 0) <= 1 ? 100 : 1))), status: "RESOLVED", reason: String(body?.candidate?.reason || "validated_domain").slice(0, 200), evidence: [{ type: "official_website", value: candidate.website }] }, { onConflict: "owner_id,id" });
    const expiresAt = new Date(now.getTime() + CACHE_DAYS * 86400000).toISOString();
    await admin.from("company_research").upsert({ owner_id: user.id, id: researchId, company_id: companyId, domain: candidate.domain, status: "COMPLETED", summary: result.summary, confidence: result.confidence, cache_key: cacheKey, expires_at: expiresAt }, { onConflict: "owner_id,cache_key" });
    const { data: saved } = await admin.from("company_research").select("id").eq("owner_id", user.id).eq("cache_key", cacheKey).single(); const savedId = saved!.id;
    const factKeys = ["industry","products_services","target_customers","markets","headquarters","company_size","public_contacts"];
    await admin.from("company_facts").delete().eq("owner_id", user.id).eq("research_id", savedId);
    await admin.from("company_facts").insert(factKeys.map(key => ({ owner_id: user.id, id: crypto.randomUUID(), research_id: savedId, fact_key: key, fact_value: result[key as keyof typeof result], confidence: result.confidence })));
    const sources = [{ url: page.url, title: candidate.company_name, retrieved_at: now.toISOString(), fact_keys: factKeys }];
    await admin.from("research_sources").delete().eq("owner_id", user.id).eq("research_id", savedId);
    await admin.from("research_sources").insert(sources.map(source => ({ owner_id: user.id, id: crypto.randomUUID(), research_id: savedId, ...source })));
    await admin.from("audit_log").insert({ owner_id: user.id, actor_id: user.id, action: force ? "RESEARCH_REFRESH" : "RESEARCH_CREATE", object_type: "company_research", object_id: savedId, metadata: { domain: candidate.domain, source_count: sources.length } });
    await admin.from("research_jobs").update({ status: "COMPLETED", lease_until: now.toISOString(), updated_at: new Date().toISOString() }).eq("owner_id", user.id).eq("cache_key", cacheKey);
    return json({ status: "completed", cache: "miss", result: { ...result, sources } });
  } catch (error) {
    if (activeCacheKey) await admin.from("research_jobs").update({ status: "FAILED", error_code: error instanceof Error ? error.message.slice(0, 100) : "RESEARCH_FAILED", updated_at: new Date().toISOString() }).eq("owner_id", user.id).eq("cache_key", activeCacheKey);
    return json({ error: error instanceof Error ? error.message : "RESEARCH_FAILED" }, 422);
  }
});
