(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).companyResearch = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATUSES = new Set(["not_researched", "resolving", "candidate", "researching", "completed", "unresolved", "failed", "stale"]);
  const stringArray = value => Array.isArray(value) && value.every(item => typeof item === "string" && item.length <= 500);
  const contactCategories = new Set(["HOTLINE", "SALES", "SUPPORT", "GENERIC_EMAIL", "OFFICE"]);
  const genericMailboxes = new Set(["info", "hello", "contact", "sales", "support", "help", "office", "admin", "customer", "customerservice", "service"]);
  const personalLabel = /\b(?:ceo|founder|director|manager|mr|mrs|ms|dr|mobile|personal|zalo|whatsapp)\b/i;
  const safeHttpUrl = value => {
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  };
  const normalizedDomain = value => {
    try { return new URL(/^https?:/i.test(String(value)) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
  };

  function validateResearchOutput(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Research output phải là object");
    if (!String(value.company_name || "").trim()) throw new Error("Research thiếu company_name");
    if (value.official_website && !safeHttpUrl(value.official_website)) throw new Error("official_website không hợp lệ");
    for (const key of ["industry", "products_services", "target_customers", "markets"]) if (!stringArray(value[key] || [])) throw new Error(`${key} không hợp lệ`);
    if (!Array.isArray(value.sources) || !Array.isArray(value.evidence)) throw new Error("Research evidence không hợp lệ");
    const sourceUrls = new Set();
    for (const source of value.sources) {
      if (!source || !safeHttpUrl(source.url) || !String(source.title || "").trim() || Number.isNaN(Date.parse(source.retrieved_at || source.accessed_at))) throw new Error("Research source không hợp lệ");
      sourceUrls.add(source.url);
    }
    for (const evidence of value.evidence) {
      if (!evidence || !String(evidence.fact_key || "").trim() || !sourceUrls.has(evidence.source_url) || String(evidence.excerpt || "").trim().length < 8 || String(evidence.excerpt).length > 500 || Number.isNaN(Date.parse(evidence.retrieved_at))) throw new Error("Fact evidence không hợp lệ");
    }
    if (!Array.isArray(value.public_company_contacts) || !value.public_company_contacts.every(item => {
      if (!item || !contactCategories.has(item.category) || !String(item.value || "").trim() || String(item.value).length > 320 || !String(item.label || "").trim() || String(item.label).length > 160 || personalLabel.test(item.label) || !sourceUrls.has(item.source_url) || String(item.evidence_excerpt || "").trim().length < 8) return false;
      if (!String(item.value).includes("@")) return item.category !== "GENERIC_EMAIL" && /^\+?[0-9][0-9\s().-]{6,20}$/.test(String(item.value));
      const [mailbox] = String(item.value).toLowerCase().split("@");
      return ["GENERIC_EMAIL", "SALES", "SUPPORT"].includes(item.category) && genericMailboxes.has(mailbox.replace(/[^a-z0-9]/g, ""));
    })) throw new Error("public_company_contacts không hợp lệ");
    if (!value.researched_at || Number.isNaN(Date.parse(value.researched_at))) throw new Error("researched_at không hợp lệ");
    if (!value.identity || !value.identity.resolution_id || !Number.isInteger(Number(value.identity.identity_version)) || !["SERVER_VERIFIED", "USER_CONFIRMED"].includes(value.identity.identity_status)) throw new Error("Research identity binding không hợp lệ");
    const coverage = Number(value.evidence_coverage || 0);
    if (!Number.isFinite(coverage) || coverage < 0 || coverage > 100) throw new Error("evidence_coverage không hợp lệ");
    return {
      company_name: String(value.company_name).trim(), official_website: value.official_website || "", summary: String(value.summary || "").slice(0, 4000),
      industry: value.industry || [], products_services: value.products_services || [], target_customers: value.target_customers || [], markets: value.markets || [],
      headquarters: value.headquarters || null, company_size: value.company_size || null,
      public_company_contacts: value.public_company_contacts.map(item => ({ category: item.category, value: String(item.value), label: String(item.label), source_url: item.source_url, evidence_excerpt: String(item.evidence_excerpt).slice(0, 500) })),
      verification_status: ["SUPPORTED", "PARTIAL", "UNVERIFIED"].includes(value.verification_status) ? value.verification_status : "UNVERIFIED",
      evidence_coverage: coverage, researched_at: value.researched_at,
      evidence: value.evidence.map(item => ({ claim_id: String(item.claim_id || ""), fact_key: String(item.fact_key), source_url: item.source_url, excerpt: String(item.excerpt).slice(0, 500), retrieved_at: item.retrieved_at, derivation_type: item.derivation_type === "EXTRACTED" ? "EXTRACTED" : "INFERRED", verification_status: item.verification_status === "SUPPORTED" ? "SUPPORTED" : "UNVERIFIED" })),
      sources: value.sources.map(source => ({ url: source.url, title: String(source.title).slice(0, 500), retrieved_at: source.retrieved_at || source.accessed_at, fact_keys: source.fact_keys || [] })),
      identity: { resolution_id: String(value.identity.resolution_id), identity_version: Number(value.identity.identity_version), identity_status: value.identity.identity_status, domain: String(value.identity.domain || ""), company_name: String(value.identity.company_name || value.company_name) }
    };
  }

  function minimalResearchInput(input = {}) {
    const email = String(input.businessEmail || input.email || "").trim().slice(0, 320);
    const businessEmailDomain = email.includes("@") ? email.split("@").pop().toLowerCase() : email.toLowerCase();
    return {
      contact_id: String(input.contactId || input.contact_id || "").trim().slice(0, 160),
      tenant_company_id: String(input.tenantCompanyId || input.tenant_company_id || "").trim().slice(0, 160),
      company_name: String(input.companyName || input.company_name || "").trim().slice(0, 300),
      website: String(input.website || "").trim().slice(0, 1000),
      business_email_domain: businessEmailDomain.slice(0, 253),
      address: String(input.address || "").trim().slice(0, 1000)
    };
  }

  function isAutoResearchEligible({ contact, cards = [], autoEnabled = true, configured = true, authenticated = true, online = true, serverReady = true } = {}) {
    if (!autoEnabled) return { eligible: false, reason: "AUTO_RESEARCH_DISABLED" };
    if (!configured) return { eligible: false, reason: "SERVER_NOT_CONFIGURED" };
    if (!authenticated) return { eligible: false, reason: "AUTH_REQUIRED" };
    if (!online) return { eligible: false, reason: "OFFLINE" };
    if (!contact || contact.lifecycle !== "ACTIVE") return { eligible: false, reason: "CONTACT_NOT_ACTIVE" };
    if (contact.draft) return { eligible: false, reason: "CONTACT_CONFIRMATION_REQUIRED" };
    const relationship = (contact.relationships || []).find(item => item.primary && item.status === "ACTIVE") || (contact.relationships || []).find(item => item.status === "ACTIVE");
    if (!relationship?.company) return { eligible: false, reason: "ACTIVE_COMPANY_RELATIONSHIP_REQUIRED" };
    const tenantCompanyId = relationship.companyId || (relationship.id ? `company_${relationship.id}` : "");
    if (!tenantCompanyId) return { eligible: false, reason: "TENANT_COMPANY_REQUIRED" };
    const confirmedCard = cards.some(card => card && card.contactId === contact.id && card.lifecycle === "ACTIVE" && card.reviewStatus === "USER_CONFIRMED");
    if (!confirmedCard) return { eligible: false, reason: "CONFIRMED_CARD_REQUIRED" };
    if (!serverReady) return { eligible: false, reason: "SERVER_SYNC_REQUIRED" };
    return { eligible: true, reason: "ELIGIBLE", relationship, tenantCompanyId };
  }

  class ResearchManager {
    constructor({ db, client, resolver, getOwnerId, getEpoch = () => 0, cacheDays = 30, autoEnabled = true, now = Date.now }) {
      this.db = db; this.client = client; this.resolver = resolver; this.getOwnerId = getOwnerId; this.getEpoch = getEpoch; this.cacheDays = cacheDays; this.autoEnabled = autoEnabled; this.now = now;
      this.states = new Map(); this.inflight = new Map(); this.listeners = new Set();
    }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(key, state) { this.states.set(key, state); this.listeners.forEach(listener => listener(key, state)); return state; }
    getState(key) { return this.states.get(key) || { status: "not_researched" }; }
    reset() { this.states.clear(); this.inflight.clear(); }
    setAutoEnabled(value) { this.autoEnabled = Boolean(value); }
    cacheKey(resolution, tenantCompanyId = "") { return `${tenantCompanyId}|v${Number(resolution.identity_version)}|${String(resolution.candidate?.domain || "").toLowerCase().replace(/[^a-z0-9.-]/g, "_")}`.slice(0, 500); }
    isFresh(record) { return record?.result && this.now() - Date.parse(record.result.researched_at) < this.cacheDays * 86400000; }
    async enqueue(input, { manual = false, force = false, confirmIdentity = false } = {}) {
      if (!manual && !this.autoEnabled) return { status: "not_researched", reason: "AUTO_RESEARCH_DISABLED" };
      const ownerId = this.getOwnerId();
      if (!ownerId) return { status: "failed", reason: "AUTH_REQUIRED" };
      const epoch = this.getEpoch();
      const minimized = minimalResearchInput(input);
      const inputKey = `${ownerId}|${minimized.contact_id}|${minimized.tenant_company_id}|${minimized.website}|${minimized.business_email_domain}|${minimized.company_name}|${confirmIdentity}`.toLowerCase();
      if (this.inflight.has(inputKey)) return this.inflight.get(inputKey);
      const task = this._run(ownerId, epoch, minimized, { force, confirmIdentity }).finally(() => this.inflight.delete(inputKey));
      this.inflight.set(inputKey, task);
      return task;
    }
    async _run(ownerId, epoch, minimized, { force, confirmIdentity }) {
      const current = () => this.getOwnerId() === ownerId && this.getEpoch() === epoch;
      const stateKey = minimized.tenant_company_id || minimized.company_name;
      if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
      if (!minimized.contact_id) return this.emit(stateKey, { status: "unresolved", reason: "CONFIRMED_CONTACT_REQUIRED" });
      if (!minimized.tenant_company_id) return this.emit(stateKey, { status: "unresolved", reason: "TENANT_COMPANY_REQUIRED" });
      const candidate = this.resolver.resolveCompany({ companyName: minimized.company_name, website: minimized.website, businessEmail: minimized.business_email_domain, address: minimized.address });
      if (candidate.status === "unresolved" && !minimized.address) return this.emit(stateKey, { status: "unresolved", reason: candidate.reason, candidate });
      if (!this.client) return this.emit(stateKey, { status: "failed", reason: "SUPABASE_CONFIG_REQUIRED", candidate });
      this.emit(stateKey, { status: "resolving", candidate });
      let resolution;
      try {
        resolution = await this.client.invoke("company-resolver", {
          contact_id: minimized.contact_id,
          tenant_company_id: minimized.tenant_company_id,
          candidate: candidate.status === "candidate" ? { company_name: candidate.company_name, domain: candidate.domain, website: candidate.website, reason: candidate.reason } : undefined,
          address: minimized.address,
          confirm_identity: Boolean(confirmIdentity)
        });
      } catch (error) {
        return this.emit(stateKey, { status: "failed", reason: error.code || "RESOLVER_FAILED", message: error.message, candidate });
      }
      if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
      if (resolution?.status === "candidate") return this.emit(stateKey, { status: "candidate", reason: resolution.reason || "COMPANY_IDENTITY_NOT_PROVEN", candidate: resolution.candidate || candidate, resolution, message: "Website chưa đủ bằng chứng để tự xác minh. Hãy đối chiếu rồi xác nhận thủ công nếu đúng công ty." });
      if (resolution?.status !== "resolved" || !["SERVER_VERIFIED", "USER_CONFIRMED"].includes(resolution.identity_status)) return this.emit(stateKey, { status: "unresolved", reason: resolution?.reason || "SERVER_UNRESOLVED", candidate });
      const key = this.cacheKey(resolution, minimized.tenant_company_id);
      const cached = await this.db.getResearch(ownerId, key);
      if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
      if (!force && this.isFresh(cached)) return this.emit(stateKey, { status: "completed", cache: "hit", result: cached.result, candidate: resolution.candidate, resolution });
      this.emit(stateKey, { status: "researching", cache: cached ? "expired" : "miss", candidate: resolution.candidate, resolution });
      try {
        const response = await this.client.invoke("company-research", { contact_id: minimized.contact_id, tenant_company_id: minimized.tenant_company_id, resolution_id: resolution.resolution_id, identity_version: resolution.identity_version, force: Boolean(force) });
        if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
        if (response?.tenant_company_id && response.tenant_company_id !== minimized.tenant_company_id) throw Object.assign(new Error("TenantCompany identity mismatch"), { code: "TENANT_COMPANY_MISMATCH" });
        if (response?.status === "researching") return this.emit(stateKey, { status: "researching", cache: response.cache || "coalesced", candidate: resolution.candidate, resolution, jobId: response.job_id || "" });
        if (response?.status === "unresolved") return this.emit(stateKey, { status: "unresolved", reason: response.reason || "SERVER_UNRESOLVED", candidate: resolution.candidate, resolution });
        const result = validateResearchOutput(response?.result || response);
        await this.db.putResearch(ownerId, key, { result, resolution, cachedAt: new Date(this.now()).toISOString() });
        if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
        return this.emit(stateKey, { status: "completed", cache: response?.cache || "miss", result, candidate: resolution.candidate, resolution });
      } catch (error) {
        return this.emit(stateKey, { status: "failed", reason: error.code || "RESEARCH_FAILED", message: error.message, candidate: resolution.candidate, resolution });
      }
    }
  }

  return { STATUSES, validateResearchOutput, minimalResearchInput, isAutoResearchEligible, normalizedDomain, ResearchManager };
}));
