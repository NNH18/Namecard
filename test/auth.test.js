const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");
const { AuthManager } = require("../lib/auth.js");
const { BrowserMemorySessionStore, NativeSecureSessionStore, createSessionStore } = require("../lib/session-store.js");

const session = id => ({ access_token: `access-${id}`, refresh_token: `refresh-${id}`, expires_in: 3600, user: { id, email: `${id}@example.test` } });

test("auth restores and signs out without retaining token", async () => {
  const db = await new MemoryLocalDb().open(); let token = ""; let logoutToken = "";
  const client = { setAccessToken: value => { token = value; }, refresh: async () => session("owner_one"), signOut: async () => { logoutToken = token; } };
  const sessionStore = new BrowserMemorySessionStore(); await sessionStore.save(session("owner_one"));
  const auth = new AuthManager({ client, db, sessionStore });
  await auth.restore(); assert.equal(auth.ownerId(), "owner_one");
  await auth.signOut(); assert.equal(logoutToken, "access-owner_one"); assert.equal(token, ""); assert.equal(await db.getSession("supabase-session"), null);
});

test("late sign-in response cannot replace newer account epoch", async () => {
  const db = await new MemoryLocalDb().open(); let resolveFirst;
  const client = { setAccessToken() {}, signIn: email => email.startsWith("first") ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(session("owner_two")) };
  const auth = new AuthManager({ client, db });
  const first = auth.signIn("first@example.test", "password1").catch(() => null);
  await auth.signIn("second@example.test", "password2"); resolveFirst(session("owner_one")); await first;
  assert.equal(auth.ownerId(), "owner_two");
});

test("native mode stores refresh token only in Keychain/Keystore adapter and clears it on logout", async () => {
  const db = await new MemoryLocalDb().open(); const vault = new Map();
  const plugin = {
    setToken: async ({ name, value }) => vault.set(name, value),
    getToken: async ({ name }) => ({ value: vault.get(name) || null }),
    removeToken: async ({ name }) => vault.delete(name)
  };
  const sessionStore = createSessionStore({ runtime: { isNativePlatform: () => true, isPluginAvailable: () => true }, securePlugin: plugin, legacyDb: db });
  const client = { setAccessToken() {}, signIn: async () => session("owner_one"), refresh: async token => { assert.equal(token, "refresh-owner_one"); return session("owner_one"); }, signOut: async () => {} };
  const auth = new AuthManager({ client, db, sessionStore });
  await auth.signIn("owner_one@example.test", "password1");
  assert.equal(await db.getSession("supabase-session"), null);
  assert.equal([...vault.values()].some(value => value.includes("refresh-owner_one")), true);
  const restored = new AuthManager({ client, db, sessionStore }); await restored.restore();
  assert.equal(restored.ownerId(), "owner_one");
  await restored.signOut();
  assert.equal(vault.size, 0); assert.equal(await db.getSession("supabase-session"), null);
});

test("account switch replaces the old secure token and old account cannot be restored", async () => {
  const db = await new MemoryLocalDb().open(); let stored = null;
  const store = new NativeSecureSessionStore({ plugin: { setToken: async ({ value }) => { stored = value; }, getToken: async () => ({ value: stored }), removeToken: async () => { stored = null; } }, legacyDb: db });
  const client = { setAccessToken() {}, signIn: async email => session(email.startsWith("one") ? "owner_one" : "owner_two") };
  const auth = new AuthManager({ client, db, sessionStore: store });
  await auth.signIn("one@example.test", "password1"); await auth.signIn("two@example.test", "password2");
  assert.equal(stored.includes("refresh-owner_one"), false);
  assert.equal(stored.includes("refresh-owner_two"), true);
});

test("native mode refuses plaintext fallback when secure plugin is unavailable", () => {
  assert.throws(() => createSessionStore({ runtime: { isNativePlatform: () => true, isPluginAvailable: () => false } }), error => error.code === "NATIVE_SECURE_STORAGE_REQUIRED");
});
