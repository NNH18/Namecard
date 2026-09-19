(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).sessionStore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TOKEN_SLOT = "bcard-refresh-session";
  const clone = value => value === undefined ? undefined : (typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const persistedSession = session => ({
    refresh_token: String(session?.refresh_token || ""),
    expires_at: Number(session?.expires_at || 0),
    token_type: String(session?.token_type || "bearer"),
    user: { id: String(session?.user?.id || ""), email: String(session?.user?.email || "") }
  });
  const validatePersisted = value => {
    if (!value?.refresh_token || !value?.user?.id) return null;
    return persistedSession(value);
  };

  class BrowserMemorySessionStore {
    constructor() { this.value = null; this.kind = "browser-memory"; }
    async save(session) { this.value = persistedSession(session); }
    async load() { return clone(this.value); }
    async clear() { this.value = null; }
  }

  class NativeSecureSessionStore {
    constructor({ plugin, legacyDb = null }) {
      if (!plugin?.setToken || !plugin?.getToken || !plugin?.removeToken) throw Object.assign(new Error("Native secure session storage không khả dụng"), { code: "NATIVE_SECURE_STORAGE_REQUIRED" });
      this.plugin = plugin; this.legacyDb = legacyDb; this.kind = "native-secure";
    }
    async purgeLegacy() { await this.legacyDb?.deleteSession?.("supabase-session"); }
    async save(session) {
      const value = persistedSession(session);
      if (!validatePersisted(value)) throw new Error("Session không hợp lệ");
      await this.plugin.setToken({ name: TOKEN_SLOT, value: JSON.stringify(value) });
      await this.purgeLegacy();
    }
    async load() {
      await this.purgeLegacy();
      const result = await this.plugin.getToken({ name: TOKEN_SLOT });
      if (!result?.value) return null;
      try { return validatePersisted(JSON.parse(result.value)); }
      catch { await this.clear(); return null; }
    }
    async clear() {
      await this.plugin.removeToken({ name: TOKEN_SLOT });
      await this.purgeLegacy();
    }
  }

  function createSessionStore({ runtime = globalThis.Capacitor, securePlugin = null, legacyDb = null } = {}) {
    const native = Boolean(runtime?.isNativePlatform?.());
    if (!native) return new BrowserMemorySessionStore();
    if (runtime?.isPluginAvailable && !runtime.isPluginAvailable("TokenVault")) throw Object.assign(new Error("TokenVault native plugin chưa được cài"), { code: "NATIVE_SECURE_STORAGE_REQUIRED" });
    const plugin = securePlugin || runtime?.registerPlugin?.("TokenVault");
    return new NativeSecureSessionStore({ plugin, legacyDb });
  }

  return { TOKEN_SLOT, BrowserMemorySessionStore, NativeSecureSessionStore, createSessionStore, persistedSession };
}));
