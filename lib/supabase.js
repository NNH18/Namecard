(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).supabase = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  class SupabaseError extends Error {
    constructor(message, { status = 0, code = "SUPABASE_ERROR", details = null } = {}) { super(message); this.name = "SupabaseError"; this.status = status; this.code = code; this.details = details; }
  }

  class SupabaseClient {
    constructor({ url, anonKey, fetchImpl = globalThis.fetch }) {
      if (!url || !anonKey || !fetchImpl) throw new Error("Supabase client config chưa đầy đủ");
      this.url = url.replace(/\/$/, ""); this.anonKey = anonKey; this.fetch = fetchImpl; this.accessToken = "";
    }
    setAccessToken(token) { this.accessToken = String(token || ""); }
    async request(path, { method = "GET", body, headers = {}, token = this.accessToken, signal, raw = false } = {}) {
      const response = await this.fetch(`${this.url}${path}`, {
        method, signal, cache: "no-store", credentials: "omit",
        headers: { apikey: this.anonKey, Authorization: `Bearer ${token || this.anonKey}`, ...(body !== undefined && !(body instanceof Blob) ? { "Content-Type": "application/json" } : {}), ...headers },
        body: body === undefined ? undefined : body instanceof Blob || typeof body === "string" ? body : JSON.stringify(body)
      });
      if (!response.ok) {
        let details = null;
        try { details = await response.json(); } catch { details = await response.text().catch(() => ""); }
        const serverCode = details?.code || "";
        const code = serverCode === "40001" || details?.message === "STALE_VERSION" || response.status === 409 ? "CONFLICT" : response.status === 401 ? "AUTH_REQUIRED" : serverCode || "HTTP_ERROR";
        throw new SupabaseError(details?.message || details?.error_description || `Supabase HTTP ${response.status}`, { status: response.status, code, details });
      }
      if (raw) return response;
      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
    signUp(email, password, signal) { return this.request("/auth/v1/signup", { method: "POST", body: { email, password }, token: this.anonKey, signal }); }
    signIn(email, password, signal) { return this.request("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password }, token: this.anonKey, signal }); }
    refresh(refreshToken, signal) { return this.request("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: refreshToken }, token: this.anonKey, signal }); }
    signOut(signal) { return this.request("/auth/v1/logout", { method: "POST", signal }); }
    getUser(signal) { return this.request("/auth/v1/user", { signal }); }
    rest(table, { method = "GET", query = "", body, headers = {}, signal } = {}) {
      if (!/^[a-z][a-z0-9_]*$/.test(table)) throw new Error("Tên table không hợp lệ");
      return this.request(`/rest/v1/${table}${query ? `?${query}` : ""}`, { method, body, headers, signal });
    }
    upsert(table, rows, { onConflict = "id", signal } = {}) {
      return this.rest(table, { method: "POST", query: `on_conflict=${encodeURIComponent(onConflict)}`, body: rows, headers: { Prefer: "resolution=merge-duplicates,return=representation" }, signal });
    }
    rpc(name, body, signal) {
      if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Tên RPC không hợp lệ");
      return this.request(`/rest/v1/rpc/${name}`, { method: "POST", body, signal });
    }
    invoke(name, body, signal) {
      if (!/^[a-z][a-z0-9_-]*$/.test(name)) throw new Error("Tên Edge Function không hợp lệ");
      return this.request(`/functions/v1/${name}`, { method: "POST", body, signal });
    }
    upload(bucket, path, blob, { upsert = true, contentType = blob.type || "application/octet-stream", signal } = {}) {
      return this.request(`/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", body: blob, headers: { "Content-Type": contentType, "x-upsert": String(upsert), "Cache-Control": "no-store, private" }, signal });
    }
    async download(bucket, path, signal) { const response = await this.request(`/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, { signal, raw: true }); return response.blob(); }
    signUrl(bucket, path, expiresIn = 300, signal) { return this.request(`/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`, { method: "POST", body: { expiresIn }, signal }); }
    remove(bucket, paths, signal) { return this.request(`/storage/v1/object/${encodeURIComponent(bucket)}`, { method: "DELETE", body: { prefixes: paths }, signal }); }
  }

  return { SupabaseClient, SupabaseError };
}));
