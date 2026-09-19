import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { CORS_HEADERS, json, safePublicUrl, validateCandidate } from "../_shared/security.ts";

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = request.headers.get("authorization") || "";
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { authorization: auth } } });
  const { data: { user } } = await client.auth.getUser();
  if (!user) return json({ error: "AUTH_REQUIRED" }, 401);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  try {
    const body = await request.json();
    const tenantCompanyId = String(body?.tenant_company_id || "").trim().slice(0,160);
    if (!/^[a-zA-Z0-9_-]{3,160}$/.test(tenantCompanyId)) return json({ status: "unresolved", reason: "TENANT_COMPANY_REQUIRED" }, 422);
    const { data: tenantCompany } = await admin.from("tenant_companies").select("id,name,website,lifecycle").eq("owner_id",user.id).eq("id",tenantCompanyId).eq("lifecycle","ACTIVE").maybeSingle();
    if (!tenantCompany) return json({ status: "unresolved", reason: "TENANT_COMPANY_NOT_FOUND" }, 404);
    if (body?.candidate || body?.domain || body?.website) {
      const candidate = validateCandidate({ ...(body?.candidate || body), company_name: tenantCompany.name });
      return json({ status: "resolved", tenant_company_id: tenantCompanyId, candidate: { ...candidate, status: "resolved", confidence: 0.95, reason: "validated_domain" } });
    }
    const companyName = String(tenantCompany.name || "").trim().slice(0, 300);
    const address = String(body?.address || "").trim().slice(0, 1000);
    if (!companyName || !address) return json({ status: "unresolved", reason: "AMBIGUOUS_WITHOUT_DOMAIN" }, 422);
    const maxRequests = Math.max(1, Math.min(100, Number(Deno.env.get("RESOLVER_RATE_LIMIT_PER_HOUR") || 10)));
    const { data: quota, error: quotaError } = await admin.rpc("consume_research_quota",{ p_owner_id:user.id,p_bucket:"resolver",p_limit:maxRequests,p_units:1 });
    if (quotaError) throw new Error("QUOTA_CHECK_FAILED");
    if (!quota?.allowed) return json({ status: "unresolved", reason: "RATE_LIMITED" }, 429);
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return json({ status: "unresolved", reason: "RESOLVER_PROVIDER_NOT_CONFIGURED" }, 503);
    const model = Deno.env.get("COMPANY_RESEARCH_MODEL") || "gpt-5-mini";
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", signal: controller.signal, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model, tools: [{ type: "web_search_preview" }], input: `Resolve the official website for this company only when public evidence clearly matches both name and address. Company: ${companyName}\nAddress: ${address}`, text: { format: { type: "json_schema", name: "company_candidate", strict: true, schema: { type: "object", additionalProperties: false, required: ["resolved","company_name","domain","website","confidence","reason","evidence"], properties: { resolved: { type: "boolean" }, company_name: { type: "string" }, domain: { type: "string" }, website: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 }, reason: { type: "string" }, evidence: { type: "array", items: { type: "object", additionalProperties: false, required: ["url","title"], properties: { url: { type: "string" }, title: { type: "string" } } } } } } } } }) }).finally(() => clearTimeout(timeout));
    if (!response.ok) return json({ status: "unresolved", reason: `RESOLVER_${response.status}` }, 422);
    const result = await response.json(); const outputText = result.output_text || result.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
    const parsed = JSON.parse(outputText);
    if (!parsed.resolved || Number(parsed.confidence) < 0.8) return json({ status: "unresolved", reason: parsed.reason || "LOW_CONFIDENCE" }, 422);
    const candidate = validateCandidate({ company_name: parsed.company_name || companyName, domain: parsed.domain, website: parsed.website });
    const evidence = Array.isArray(parsed.evidence) ? parsed.evidence.slice(0, 10).map((item: any) => ({ url: safePublicUrl(String(item.url)).toString(), title: String(item.title).slice(0, 300) })) : [];
    return json({ status: "resolved", tenant_company_id: tenantCompanyId, candidate: { ...candidate, status: "resolved", confidence: Number(parsed.confidence), reason: parsed.reason || "name_address_public_evidence", evidence } });
  } catch (error) {
    return json({ status: "unresolved", reason: error instanceof Error ? error.message : "INVALID_CANDIDATE" }, 422);
  }
});
