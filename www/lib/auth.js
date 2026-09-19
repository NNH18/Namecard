(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).auth = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const SESSION_KEY = "supabase-session";
  const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/u.test(String(value || "").trim());
  const validPassword = value => String(value || "").length >= 8;

  class AuthManager {
    constructor({ client, db }) { this.client = client; this.db = db; this.session = null; this.listeners = new Set(); this.epoch = 0; this.controller = null; this.refreshTimer = null; }
    subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    emit(type, payload = {}) { const event = { type, session: this.session, epoch: this.epoch, ...payload }; this.listeners.forEach(listener => listener(event)); }
    validate(email, password) {
      if (!validEmail(email)) throw new Error("Email không hợp lệ");
      if (!validPassword(password)) throw new Error("Mật khẩu phải có ít nhất 8 ký tự");
    }
    normalizeSession(response) {
      const session = response?.session || response;
      const user = session?.user || response?.user;
      if (!session?.access_token || !session?.refresh_token || !user?.id) throw new Error("Supabase không trả về session hợp lệ");
      return { access_token: session.access_token, refresh_token: session.refresh_token, expires_at: session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600), token_type: session.token_type || "bearer", user: { id: user.id, email: user.email || "" } };
    }
    async applySession(response, expectedEpoch) {
      if (expectedEpoch !== this.epoch) return null;
      const session = this.normalizeSession(response);
      this.session = session;
      this.client.setAccessToken(session.access_token);
      await this.db.putSession(SESSION_KEY, session);
      if (expectedEpoch !== this.epoch) return null;
      this.scheduleRefresh();
      this.emit("SIGNED_IN");
      return session;
    }
    scheduleRefresh() {
      if (this.refreshTimer) clearTimeout(this.refreshTimer);
      const delay = Math.max(1000, Number(this.session?.expires_at || 0) * 1000 - Date.now() - 60000);
      this.refreshTimer = setTimeout(() => this.refreshSession(), delay);
      this.refreshTimer?.unref?.();
    }
    async refreshSession() {
      if (!this.session?.refresh_token) return null;
      const epoch = this.epoch;
      try { return await this.applySession(await this.client.refresh(this.session.refresh_token), epoch); }
      catch (error) {
        if (epoch === this.epoch) {
          this.session = null; this.client.setAccessToken(""); await this.db.deleteSession(SESSION_KEY); this.emit("SIGNED_OUT", { reason: "SESSION_EXPIRED", error });
        }
        return null;
      }
    }
    async signIn(email, password) {
      this.validate(email, password); const epoch = ++this.epoch;
      this.controller?.abort(); this.controller = new AbortController();
      this.emit("LOADING");
      try { return await this.applySession(await this.client.signIn(email.trim(), password, this.controller.signal), epoch); }
      catch (error) { if (epoch === this.epoch) this.emit("ERROR", { error }); throw error; }
    }
    async signUp(email, password) {
      this.validate(email, password); const epoch = ++this.epoch;
      this.controller?.abort(); this.controller = new AbortController(); this.emit("LOADING");
      try {
        const response = await this.client.signUp(email.trim(), password, this.controller.signal);
        if (response?.session || response?.access_token) return this.applySession(response, epoch);
        if (epoch === this.epoch) this.emit("CONFIRM_EMAIL", { email: email.trim() });
        return null;
      } catch (error) { if (epoch === this.epoch) this.emit("ERROR", { error }); throw error; }
    }
    async restore() {
      const saved = await this.db.getSession(SESSION_KEY);
      if (!saved?.refresh_token) { this.emit("SIGNED_OUT"); return null; }
      const epoch = ++this.epoch; this.controller?.abort(); this.controller = new AbortController(); this.emit("LOADING");
      try { return await this.applySession(await this.client.refresh(saved.refresh_token, this.controller.signal), epoch); }
      catch (error) { await this.db.deleteSession(SESSION_KEY); if (epoch === this.epoch) { this.session = null; this.client.setAccessToken(""); this.emit("SIGNED_OUT", { reason: "SESSION_EXPIRED" }); } return null; }
    }
    async signOut() {
      ++this.epoch; this.controller?.abort(); this.controller = null; if (this.refreshTimer) clearTimeout(this.refreshTimer); this.refreshTimer = null;
      const hadSession = Boolean(this.session);
      if (hadSession) await this.client.signOut().catch(() => {});
      this.session = null; this.client.setAccessToken("");
      await this.db.deleteSession(SESSION_KEY);
      this.emit("SIGNED_OUT");
    }
    ownerId() { return this.session?.user?.id || ""; }
    isAuthenticated() { return Boolean(this.ownerId()); }
  }

  return { AuthManager, validEmail, validPassword, SESSION_KEY };
}));
