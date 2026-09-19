(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).config = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SERVER_ONLY_KEYS = ["OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"];

  function clean(value) { return String(value || "").trim(); }

  function validUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" || ["localhost", "127.0.0.1"].includes(url.hostname);
    } catch { return false; }
  }

  function parseBoolean(value, fallback) {
    if (value === undefined || value === null || value === "") return fallback;
    return value === true || String(value).toLowerCase() === "true";
  }

  function readConfig(source = {}) {
    for (const key of SERVER_ONLY_KEYS) {
      if (clean(source[key])) throw new Error(`${key} là secret server-side và không được đưa vào client config`);
    }
    const supabaseUrl = clean(source.SUPABASE_URL);
    const supabaseAnonKey = clean(source.SUPABASE_ANON_KEY);
    const configured = Boolean(supabaseUrl && supabaseAnonKey);
    const errors = [];
    if (supabaseUrl && !validUrl(supabaseUrl)) errors.push("SUPABASE_URL phải là HTTPS hoặc localhost");
    if (supabaseAnonKey && supabaseAnonKey.length < 20) errors.push("SUPABASE_ANON_KEY không hợp lệ");
    if (Boolean(supabaseUrl) !== Boolean(supabaseAnonKey)) errors.push("SUPABASE_URL và SUPABASE_ANON_KEY phải được cấu hình cùng nhau");
    if (errors.length) throw new Error(errors.join("; "));
    return Object.freeze({
      mode: configured ? "production" : "development",
      configured,
      supabaseUrl: supabaseUrl.replace(/\/$/, ""),
      supabaseAnonKey,
      autoResearch: parseBoolean(source.AUTO_RESEARCH, true),
      researchCacheDays: Math.max(1, Number(source.COMPANY_RESEARCH_CACHE_DAYS || 30)),
      maxImageBytes: Math.max(1024, Number(source.MAX_IMAGE_BYTES || 15 * 1024 * 1024)),
      localOwnerId: "00000000-0000-4000-8000-000000000001"
    });
  }

  function browserConfig() { return readConfig(typeof globalThis !== "undefined" ? globalThis.BCARD_PUBLIC_CONFIG || {} : {}); }

  return { readConfig, browserConfig, validUrl, SERVER_ONLY_KEYS };
}));
