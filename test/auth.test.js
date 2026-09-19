const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");
const { AuthManager } = require("../lib/auth.js");

const session = id => ({ access_token: `access-${id}`, refresh_token: `refresh-${id}`, expires_in: 3600, user: { id, email: `${id}@example.test` } });

test("auth restores and signs out without retaining token", async () => {
  const db = await new MemoryLocalDb().open(); let token = ""; let logoutToken = "";
  const client = { setAccessToken: value => { token = value; }, refresh: async () => session("owner_one"), signOut: async () => { logoutToken = token; } };
  await db.putSession("supabase-session", session("owner_one"));
  const auth = new AuthManager({ client, db });
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
