(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).companyResolver = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const FREE_EMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com", "yahoo.com", "yahoo.com.vn", "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "proton.me", "protonmail.com", "aol.com"]);
  const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "127.0.0.1", "::1"]);

  function normalizeDomain(value = "") {
    let raw = String(value).trim().toLowerCase();
    if (!raw) return "";
    raw = raw.replace(/^mailto:/, "");
    if (raw.includes("@")) raw = raw.split("@").pop();
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
      const host = url.hostname.replace(/^www\./, "").replace(/\.$/, "");
      if (!host.includes(".") || BLOCKED_HOSTS.has(host) || /(^|\.)local$/.test(host) || /^(?:10|127|169\.254|192\.168)\./.test(host)) return "";
      return host;
    } catch { return ""; }
  }

  function safeWebsite(value = "") {
    const domain = normalizeDomain(value);
    if (!domain) return "";
    try {
      const input = String(value).trim();
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
      url.protocol = "https:";
      url.hash = "";
      return url.href;
    } catch { return ""; }
  }

  function resolveCompany(input = {}) {
    const companyName = String(input.companyName || input.company_name || "").trim();
    const website = safeWebsite(input.website || "");
    const websiteDomain = normalizeDomain(website);
    if (websiteDomain && !FREE_EMAIL_DOMAINS.has(websiteDomain)) {
      return { status: "resolved", company_name: companyName, domain: websiteDomain, website, confidence: 0.95, reason: "official_website", evidence: [{ type: "website", value: website }] };
    }
    const emailDomain = normalizeDomain(input.businessEmail || input.email || "");
    if (emailDomain && !FREE_EMAIL_DOMAINS.has(emailDomain)) {
      return { status: "resolved", company_name: companyName, domain: emailDomain, website: `https://${emailDomain}/`, confidence: 0.85, reason: "business_email_domain", evidence: [{ type: "business_email_domain", value: emailDomain }] };
    }
    const reason = emailDomain && FREE_EMAIL_DOMAINS.has(emailDomain) ? "free_email_is_not_company_evidence" : companyName ? "ambiguous_without_domain" : "insufficient_input";
    return { status: "unresolved", company_name: companyName, domain: "", website: "", confidence: 0, reason, evidence: [] };
  }

  return { FREE_EMAIL_DOMAINS, normalizeDomain, safeWebsite, resolveCompany };
}));
