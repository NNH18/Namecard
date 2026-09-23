import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { cleanHtml, CORS_HEADERS, fetchBounded, json, validateCandidate } from "../_shared/security.ts";
import { verifyCompanyIdentity } from "../_shared/research-contract.mjs";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function persistResolution(admin: any, ownerId: string, companyId: string, candidate: any, status: string, reason: string, evidence: unknown[]) {
  const id = `resolution_${companyId}`.slice(0, 160);
  const inputHash = await sha256(JSON.stringify({ companyId, companyName: candidate.company_name, domain: candidate.domain, website: candidate.website, status }));
  const { data: existing } = await admin.from("company_resolution").select("status,identity_version,input_hash").eq("owner_id", ownerId).eq("id", id).maybeSingle();
  const changed = !existing || existing.input_hash !== inputHash || existing.status !== status;
  const identityVersion = changed ? Number(existing?.identity_version || 0) + 1 : Number(existing.identity_version || 1);
  const row = {
    owner_id: ownerId, id, company_id: companyId, candidate_domain: candidate.domain, candidate_website: candidate.website,
    confidence: null, status, reason: String(reason || "").slice(0, 200), evidence,
    identity_version: identityVersion, input_hash: inputHash,
    verified_at: ["SERVER_VERIFIED", "USER_CONFIRMED"].includes(status) ? new Date().toISOString() : null,
    version: identityVersion
  };
  const { error } = await admin.from("company_resolution").upsert(row, { onConflict: "owner_id,id" });
  if (error) throw new Error("RESOLUTION_SAVE_FAILED");
  if (changed) {
    await admin.from("company_research").update({ status: "STALE", error_code: "IDENTITY_CHANGED" }).eq("owner_id", ownerId).eq("company_id", companyId).eq("status", "COMPLETED").neq("identity_version", identityVersion);
    await admin.from("audit_log").insert({ owner_id: ownerId, actor_id: ownerId, action: `COMPANY_IDENTITY_${status}`, object_type: "company_resolution", object_id: id, object_version: identityVersion, metadata: { company_id: companyId, domain: candidate.domain, reason } });
  }
  return { id, identity_version: identityVersion };
}

async function resolveCandidateWithProvider(companyName: string, address: string) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("RESOLVER_PROVIDER_NOT_CONFIGURED");
  const model = Deno.env.get("COMPANY_RESEARCH_MODEL") || "gpt-5-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST", signal: controller.signal,
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model, tools: [{ type: "web_search_preview" }],
      input: `Find a candidate official website. Do not claim verification. Company: ${companyName}\nAddress: ${address}`,
      text: { format: { type: "json_schema", name: "company_candidate", strict: true, schema: { type: "object", additionalProperties: false, required: ["found", "domain", "website", "reason"], properties: { found: { type: "boolean" }, domain: { type: "string" }, website: { type: "string" }, reason: { type: "string" } } } } }
    })
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) throw new Error(`RESOLVER_${response.status}`);
  const result = await response.json();
  const outputText = result.output_text || result.output?.flatMap((item: any) => item.content || []).find((item: any) => item.type === "output_text")?.text;
  const parsed = JSON.parse(outputText);
  if (!parsed.found) throw new Error(parsed.reason || "NO_CANDIDATE");
  return validateCandidate({ company_name: companyName, domain: parsed.domain, website: parsed.website });
}

async function assertConfirmedContact(admin: any, ownerId: string, contactId: string, companyId: string) {
  if (!/^[a-zA-Z0-9_-]{3,160}$/.test(contactId)) throw new Error("CONFIRMED_CONTACT_REQUIRED");
  const { data: contact } = await admin.from("contacts").select("id").eq("owner_id", ownerId).eq("id", contactId).eq("lifecycle", "ACTIVE").eq("draft", false).maybeSingle();
  if (!contact) throw new Error("CONFIRMED_CONTACT_REQUIRED");
  const { data: relationship } = await admin.from("contact_companies").select("id").eq("owner_id", ownerId).eq("contact_id", contactId).eq("company_id", companyId).eq("lifecycle", "ACTIVE").limit(1).maybeSingle();
  if (!relationship) throw new Error("ACTIVE_COMPANY_RELATIONSHIP_REQUIRED");
  const { data: card } = await admin.from("cards").select("id").eq("owner_id", ownerId).eq("contact_id", contactId).eq("review_status", "USER_CONFIRMED").eq("lifecycle", "ACTIVE").limit(1).maybeSingle();
  if (!card) throw new Error("CONFIRMED_CARD_REQUIRED");
}

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
    const tenantCompanyId = String(body?.tenant_company_id || "").trim().slice(0, 160);
    const contactId = String(body?.contact_id || "").trim().slice(0, 160);
    if (!/^[a-zA-Z0-9_-]{3,160}$/.test(tenantCompanyId)) return json({ status: "unresolved", reason: "TENANT_COMPANY_REQUIRED" }, 422);
    const { data: tenantCompany } = await admin.from("tenant_companies").select("id,name,website,lifecycle").eq("owner_id", user.id).eq("id", tenantCompanyId).eq("lifecycle", "ACTIVE").maybeSingle();
    if (!tenantCompany) return json({ status: "unresolved", reason: "TENANT_COMPANY_NOT_FOUND" }, 404);
    await assertConfirmedContact(admin, user.id, contactId, tenantCompanyId);
    const companyName = String(tenantCompany.name || "").trim().slice(0, 300);
    const address = String(body?.address || "").trim().slice(0, 1000);
    let candidate;
    if (body?.candidate || body?.domain || body?.website || tenantCompany.website) {
      const raw = body?.candidate || body;
      candidate = validateCandidate({ ...raw, website: raw?.website || tenantCompany.website, company_name: companyName });
    } else {
      if (!companyName || !address) return json({ status: "unresolved", reason: "AMBIGUOUS_WITHOUT_DOMAIN" }, 422);
      const maxRequests = Math.max(1, Math.min(100, Number(Deno.env.get("RESOLVER_RATE_LIMIT_PER_HOUR") || 10)));
      const { data: quota, error: quotaError } = await admin.rpc("consume_research_quota", { p_owner_id: user.id, p_bucket: "resolver", p_limit: maxRequests, p_units: 1 });
      if (quotaError) throw new Error("QUOTA_CHECK_FAILED");
      if (!quota?.allowed) return json({ status: "unresolved", reason: "RATE_LIMITED" }, 429);
      candidate = await resolveCandidateWithProvider(companyName, address);
    }
    if (body?.confirm_identity === true) {
      const stored = await persistResolution(admin, user.id, tenantCompanyId, candidate, "USER_CONFIRMED", "EXPLICIT_USER_CONFIRMATION", [{ type: "user_confirmation", source_url: candidate.website, confirmed_at: new Date().toISOString() }]);
      return json({ status: "resolved", identity_status: "USER_CONFIRMED", tenant_company_id: tenantCompanyId, resolution_id: stored.id, identity_version: stored.identity_version, candidate });
    }
    try {
      const page = await fetchBounded(candidate.website);
      const identity = verifyCompanyIdentity({ companyName, address, website: candidate.website, pageUrl: page.url, html: page.text, pageText: cleanHtml(page.text) });
      const identityStatus = identity.verified ? "SERVER_VERIFIED" : "CANDIDATE";
      const stored = await persistResolution(admin, user.id, tenantCompanyId, candidate, identityStatus, identity.reason, identity.evidence);
      return json({ status: identity.verified ? "resolved" : "candidate", identity_status: identityStatus, reason: identity.reason, tenant_company_id: tenantCompanyId, resolution_id: stored.id, identity_version: stored.identity_version, candidate, evidence: identity.evidence });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "COMPANY_IDENTITY_NOT_PROVEN";
      const stored = await persistResolution(admin, user.id, tenantCompanyId, candidate, "CANDIDATE", reason, []);
      return json({ status: "candidate", identity_status: "CANDIDATE", reason, tenant_company_id: tenantCompanyId, resolution_id: stored.id, identity_version: stored.identity_version, candidate });
    }
  } catch (error) {
    return json({ status: "unresolved", reason: error instanceof Error ? error.message : "INVALID_CANDIDATE" }, 422);
  }
});
