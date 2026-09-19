const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");
const { SyncEngine, backoffMs, sortOperations } = require("../lib/sync.js");

const operation = (id, extra = {}) => ({ id, ownerId: "owner_one", object_type: "contact", object_id: id, object_version: 1, expected_version: 0, operation_type: "UPSERT", sync_status: "PENDING", attempt_count: 0, dependencies: [], lifecycle: "ACTIVE", created_at: `2026-01-01T00:00:0${id.slice(-1) || 0}Z`, ...extra });

test("sync orders dependencies and retry does not duplicate remote mutation", async () => {
  const db = await new MemoryLocalDb().open();
  await db.atomicCommit({ ownerId: "owner_one", operations: [operation("parent"), operation("child", { object_type: "note", dependencies: ["parent"] })] });
  const calls = []; const engine = new SyncEngine({ db, remote: { syncObject: async op => { calls.push(op.id); return { version: 1 }; }, syncImage: async () => ({ version: 1 }) }, getOwnerId: () => "owner_one", random: () => 0.5 });
  await engine.process(); await engine.process();
  assert.deepEqual(calls, ["parent", "child"]);
  assert.equal((await db.getOperation("parent")).sync_status, "COMPLETE");
});

test("stale write becomes conflict and never reports complete", async () => {
  const db = await new MemoryLocalDb().open(); await db.atomicCommit({ ownerId: "owner_one", operations: [operation("stale")] });
  const engine = new SyncEngine({ db, remote: { syncObject: async () => { throw Object.assign(new Error("stale"), { status: 409 }); } }, getOwnerId: () => "owner_one" });
  await engine.process(); assert.equal((await db.getOperation("stale")).sync_status, "CONFLICT");
});

test("backoff is bounded and lifecycle supersedes uploads", async () => {
  assert.equal(backoffMs(30, { base: 1000, max: 300000, jitter: 0, random: () => 0 }), 300000);
  const sorted = sortOperations([operation("b", { dependencies: ["a"] }), operation("a")]); assert.deepEqual(sorted.map(x => x.id), ["a", "b"]);
  const db = await new MemoryLocalDb().open(); let uploaded = false;
  await db.atomicCommit({ ownerId: "owner_one", operations: [operation("image", { object_type: "card_image", lifecycle: "DELETED" })] });
  const engine = new SyncEngine({ db, remote: { syncImage: async () => { uploaded = true; } }, getOwnerId: () => "owner_one" });
  await engine.process(); assert.equal(uploaded, false); assert.equal((await db.getOperation("image")).sync_status, "SUPERSEDED");
});

test("late remote callback cannot ACK into a newly selected account", async () => {
  const db = await new MemoryLocalDb().open(); await db.atomicCommit({ ownerId: "owner_one", operations: [operation("late")] });
  let owner = "owner_one"; let epoch = 1; let resolveRemote;
  const engine = new SyncEngine({ db, remote: { syncObject: () => new Promise(resolve => { resolveRemote = resolve; }) }, getOwnerId: () => owner, getEpoch: () => epoch });
  const run = engine.process(); await new Promise(resolve => setImmediate(resolve)); owner = "owner_two"; epoch = 2; resolveRemote({ version: 1 }); await run;
  assert.notEqual((await db.getOperation("late")).sync_status, "COMPLETE");
});
