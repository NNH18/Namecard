const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");

test("local database isolates snapshots, objects and queues by owner", async () => {
  const db = await new MemoryLocalDb().open();
  await db.atomicCommit({ ownerId: "owner_one", snapshot: { contacts: [{ id: "a" }] }, objects: [{ id: "contact:a" }], operations: [{ id: "op-a", sync_status: "PENDING" }] });
  await db.atomicCommit({ ownerId: "owner_two", snapshot: { contacts: [{ id: "b" }] }, objects: [{ id: "contact:b" }], operations: [{ id: "op-b", sync_status: "PENDING" }] });
  assert.deepEqual((await db.loadSnapshot("owner_one")).contacts.map(x => x.id), ["a"]);
  assert.deepEqual((await db.getObjects("owner_two")).map(x => x.id), ["contact:b"]);
  assert.deepEqual((await db.listOperations("owner_one")).map(x => x.id), ["op-a"]);
});

test("legacy migration removes old value only after durable commit", async () => {
  const db = await new MemoryLocalDb().open(); let removed = false;
  const storage = { getItem: () => JSON.stringify({ contacts: [] }), removeItem: () => { removed = true; } };
  assert.equal(await db.migrateLegacy(storage, "legacy", "legacy_owner"), true);
  assert.equal(removed, true);
  assert.deepEqual(await db.loadSnapshot("legacy_owner"), { contacts: [] });
});
