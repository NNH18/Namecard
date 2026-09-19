(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).companyResearch = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STATUSES = new Set(["not_researched", "resolving", "researching", "completed", "unresolved", "failed"]);
  const stringArray = value => Array.isArray(value) && value.every(item => typeof item === "string" && item.length <= 500);
  const contactCategories = new Set(["HOTLINE", "SALES", "SUPPORT", "GENERIC_EMAIL", "OFFICE"]);
  const genericMailboxes = new Set(["info", "hello", "contact", "sales", "support", "help", "office", "admin", "customer", "customerservice", "service"]);
  const personalLabel = /\b(?:ceo|founder|director|manager|mr|mrs|ms|dr|mobile|personal|zalo|whatsapp)\b/i;
  const safeHttpUrl = value => {
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  };

  function validateResearchOutput(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Research output phải là object");
    if (!String(value.company_name || "").trim()) throw new Error("Research thiếu company_name");
    if (value.official_website && !safeHttpUrl(value.official_website)) throw new Error("official_website không hợp lệ");
    for (const key of ["industry", "products_services", "target_customers", "markets"]) if (!stringArray(value[key] || [])) throw new Error(`${key} không hợp lệ`);
    if (!Array.isArray(value.public_company_contacts) || !value.public_company_contacts.every(item => {
      if (!item || !contactCategories.has(item.category) || !String(item.value || "").trim() || String(item.value).length > 320 || !String(item.label || "").trim() || String(item.label).length > 160 || personalLabel.test(item.label) || !safeHttpUrl(item.source_url)) return false;
      if (!String(item.value).includes("@")) return item.category !== "GENERIC_EMAIL" && /^\+?[0-9][0-9\s().-]{6,20}$/.test(String(item.value));
      const [mailbox] = String(item.value).toLowerCase().split("@");
      return ["GENERIC_EMAIL", "SALES", "SUPPORT"].includes(item.category) && genericMailboxes.has(mailbox.replace(/[^a-z0-9]/g, ""));
    })) throw new Error("public_company_contacts không hợp lệ");
    if (!Number.isFinite(Number(value.confidence)) || Number(value.confidence) < 0 || Number(value.confidence) > 100) throw new Error("confidence không hợp lệ");
    if (!value.researched_at || Number.isNaN(Date.parse(value.researched_at))) throw new Error("researched_at không hợp lệ");
    if (!Array.isArray(value.sources)) throw new Error("sources không hợp lệ");
    for (const source of value.sources) {
      if (!source || !safeHttpUrl(source.url) || !String(source.title || "").trim() || Number.isNaN(Date.parse(source.retrieved_at || source.accessed_at))) throw new Error("Research source không hợp lệ");
      if (source.fact_keys && !stringArray(source.fact_keys)) throw new Error("source.fact_keys không hợp lệ");
    }
    return {
      company_name: String(value.company_name).trim(), official_website: value.official_website || "", summary: String(value.summary || "").slice(0, 4000),
      industry: value.industry || [], products_services: value.products_services || [], target_customers: value.target_customers || [], markets: value.markets || [],
      headquarters: value.headquarters || null, company_size: value.company_size || null, public_company_contacts: value.public_company_contacts.map(item => ({ category: item.category, value: String(item.value), label: String(item.label), source_url: item.source_url })), confidence: Number(value.confidence),
      researched_at: value.researched_at, sources: value.sources.map(source => ({ url: source.url, title: String(source.title).slice(0, 500), retrieved_at: source.retrieved_at || source.accessed_at, fact_keys: source.fact_keys || [] }))
    };
  }

  function minimalResearchInput(input = {}) {
    const email = String(input.businessEmail || input.email || "").trim().slice(0, 320);
    const businessEmailDomain = email.includes("@") ? email.split("@").pop().toLowerCase() : email.toLowerCase();
    return {
      tenant_company_id: String(input.tenantCompanyId || input.tenant_company_id || "").trim().slice(0, 160),
      company_name: String(input.companyName || input.company_name || "").trim().slice(0, 300),
      website: String(input.website || "").trim().slice(0, 1000),
      business_email_domain: businessEmailDomain.slice(0, 253),
      address: String(input.address || "").trim().slice(0, 1000)
    };
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
    cacheKey(candidate, tenantCompanyId = "") { return `${tenantCompanyId}|${String(candidate.domain || candidate.company_name || "").toLowerCase().replace(/[^a-z0-9.-]/g, "_")}`.slice(0, 400); }
    isFresh(record) { return record?.result && this.now() - Date.parse(record.result.researched_at) < this.cacheDays * 86400000; }
    async enqueue(input, { manual = false, force = false } = {}) {
      if (!manual && !this.autoEnabled) return { status: "not_researched", reason: "AUTO_RESEARCH_DISABLED" };
      const ownerId = this.getOwnerId();
      if (!ownerId) return { status: "failed", reason: "AUTH_REQUIRED" };
      const epoch = this.getEpoch();
      const minimized = minimalResearchInput(input);
      const inputKey = `${ownerId}|${minimized.tenant_company_id}|${minimized.website}|${minimized.business_email_domain}|${minimized.company_name}`.toLowerCase();
      if (this.inflight.has(inputKey)) return this.inflight.get(inputKey);
      const task = this._run(ownerId, epoch, minimized, { force }).finally(() => this.inflight.delete(inputKey));
      this.inflight.set(inputKey, task);
      return task;
    }
    async _run(ownerId, epoch, minimized, { force }) {
      const current = () => this.getOwnerId() === ownerId && this.getEpoch() === epoch;
      if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
      if (!minimized.tenant_company_id) return this.emit(minimized.company_name, { status: "unresolved", reason: "TENANT_COMPANY_REQUIRED" });
      this.emit(minimized.company_name || minimized.website, { status: "resolving" });
      let candidate = this.resolver.resolveCompany({ companyName: minimized.company_name, website: minimized.website, businessEmail: minimized.business_email_domain, address: minimized.address });
      if (candidate.status !== "resolved" && this.client && minimized.company_name && minimized.address) {
        try {
          const resolution = await this.client.invoke("company-resolver", { tenant_company_id: minimized.tenant_company_id, company_name: minimized.company_name, address: minimized.address });
          if (resolution?.status === "resolved" && resolution.candidate) candidate = resolution.candidate;
        } catch { /* A failed resolver remains explicitly unresolved. */ }
      }
      if (candidate.status !== "resolved") return this.emit(minimized.company_name, { status: "unresolved", reason: candidate.reason, candidate });
      const key = this.cacheKey(candidate, minimized.tenant_company_id);
      const cached = await this.db.getResearch(ownerId, key);
      if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
      if (!force && this.isFresh(cached)) return this.emit(key, { status: "completed", cache: "hit", result: cached.result, candidate });
      if (!this.client) return this.emit(key, { status: "failed", reason: "SUPABASE_CONFIG_REQUIRED", candidate });
      this.emit(key, { status: "researching", cache: cached ? "expired" : "miss", candidate });
      try {
        const response = await this.client.invoke("company-research", { tenant_company_id: minimized.tenant_company_id, candidate: { company_name: candidate.company_name, domain: candidate.domain, website: candidate.website, confidence: candidate.confidence, reason: candidate.reason, evidence: candidate.evidence || [] }, force: Boolean(force) });
        if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
        if (response?.tenant_company_id && response.tenant_company_id !== minimized.tenant_company_id) throw Object.assign(new Error("TenantCompany identity mismatch"), { code: "TENANT_COMPANY_MISMATCH" });
        if (response?.status === "researching") return this.emit(key, { status: "researching", cache: response.cache || "coalesced", candidate, jobId: response.job_id || "" });
        if (response?.status === "unresolved") return this.emit(key, { status: "unresolved", reason: response.reason || "SERVER_UNRESOLVED", candidate });
        const result = validateResearchOutput(response?.result || response);
        await this.db.putResearch(ownerId, key, { result, candidate, cachedAt: new Date(this.now()).toISOString() });
        if (!current()) return { status: "failed", reason: "ACCOUNT_CHANGED" };
        return this.emit(key, { status: "completed", cache: response?.cache || "miss", result, candidate });
      } catch (error) { return this.emit(key, { status: "failed", reason: error.code || "RESEARCH_FAILED", message: error.message, candidate }); }
    }
  }

  return { STATUSES, validateResearchOutput, minimalResearchInput, ResearchManager };
}));
