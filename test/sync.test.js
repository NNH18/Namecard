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

test("durable server conflict response becomes client CONFLICT without an exception", async () => {
  const db = await new MemoryLocalDb().open(); await db.atomicCommit({ ownerId: "owner_one", operations: [operation("stale-response")] });
  const engine = new SyncEngine({ db, remote: { syncObject: async () => ({ status: "CONFLICT", current_version: 4 }) }, getOwnerId: () => "owner_one" });
  await engine.process();
  const saved = await db.getOperation("stale-response");
  assert.equal(saved.sync_status, "CONFLICT"); assert.equal(saved.conflict.current_version, 4);
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

test("dispatch guard never sends an older UPSERT after a newer local DELETE", async () => {
  const db = await new MemoryLocalDb().open(); const calls = [];
  const old = operation("old", { object_id: "card_1", object_type: "card", payload: { name: "Fake Person", email: "fake@example.test" } });
  const remove = operation("remove", { object_id: "card_1", object_type: "card", object_version: 2, expected_version: 1, operation_type: "DELETE", lifecycle: "DELETED", payload: { id: "card_1" } });
  await db.atomicMutation({ ownerId: "owner_one", objects: [{ id: "card:card_1", objectType: "card", objectId: "card_1", version: 2, lifecycle: "DELETED", payload: { id: "card_1" } }], operations: [old, remove] });
  const engine = new SyncEngine({ db, remote: { syncObject: async op => { calls.push(op); return { version: op.object_version }; } }, getOwnerId: () => "owner_one" });
  await engine.process();
  assert.equal(calls.some(item => item.operation_type === "UPSERT"), false);
  assert.equal(calls.some(item => JSON.stringify(item.payload).includes("Fake Person")), false);
  assert.equal((await db.getOperation("old")).sync_status, "SUPERSEDED");
});

test("ACK-lost operation reconciles by idempotency metadata and does not resend PII", async () => {
  const db = await new MemoryLocalDb().open(); let uploads = 0; let reconciles = 0;
  const old = operation("ack-lost", { object_id: "card_2", object_type: "card", sync_status: "IN_FLIGHT", attempt_count: 1, remote_visibility: "MAY_HAVE_REACHED_SERVER", payload: { name: "Fake Person", email: "fake@example.test" } });
  await db.atomicCommit({ ownerId: "owner_one", objects: [{ id: "card:card_2", objectType: "card", objectId: "card_2", version: 1, lifecycle: "ACTIVE", payload: old.payload }], operations: [old] });
  const engine = new SyncEngine({ db, remote: { reconcileOperation: async () => { reconciles += 1; return { status: "COMPLETE", version: 1 }; }, syncObject: async () => { uploads += 1; return { version: 1 }; } }, getOwnerId: () => "owner_one" });
  await engine.reconcile("owner_one"); await engine.process();
  assert.equal(reconciles, 1); assert.equal(uploads, 0);
  assert.equal((await db.getOperation("ack-lost")).sync_status, "COMPLETE");
});

test("acked object deletion reaches remote and keeps content operation history", async () => {
  const db = await new MemoryLocalDb().open(); const calls = [];
  const old = operation("acked", { object_id: "card_3", object_type: "card", sync_status: "COMPLETE", remote_visibility: "ACKED", server_ack_version: 1, payload: { name: "Fake Person" } });
  const remove = operation("delete-acked", { object_id: "card_3", object_type: "card", object_version: 2, expected_version: 1, operation_type: "DELETE", lifecycle: "DELETED", payload: { id: "card_3" } });
  await db.atomicCommit({ ownerId: "owner_one", objects: [{ id: "card:card_3", objectType: "card", objectId: "card_3", version: 2, lifecycle: "DELETED", payload: { id: "card_3" } }], operations: [old, remove] });
  const engine = new SyncEngine({ db, remote: { syncObject: async op => { calls.push(op); return { status: "COMPLETE", version: 2 }; } }, getOwnerId: () => "owner_one" });
  await engine.process();
  assert.deepEqual(calls.map(item => item.operation_type), ["DELETE"]);
  assert.equal((await db.getOperation("acked")).sync_status, "COMPLETE");
  assert.equal((await db.getOperation("delete-acked")).sync_status, "COMPLETE");
});

test("restart after atomic local delete cannot revive superseded content", async () => {
  const db = await new MemoryLocalDb().open(); let sent = false;
  const old = operation("crash-old", { object_id: "card_4", object_type: "card", payload: { raw_ocr: "private fake OCR" } });
  await db.atomicMutation({ ownerId: "owner_one", objects: [{ id: "card:card_4", objectType: "card", objectId: "card_4", version: 1, lifecycle: "ACTIVE", payload: old.payload }], operations: [old] });
  await db.atomicMutation({ ownerId: "owner_one", objects: [{ id: "card:card_4", objectType: "card", objectId: "card_4", version: 2, lifecycle: "DELETED", payload: { id: "card_4" } }], supersede: [{ objectType: "card", objectId: "card_4", beforeVersion: 2, reason: "DELETE_SUPERSEDES_CONTENT" }] });
  const restarted = new SyncEngine({ db, remote: { syncObject: async () => { sent = true; } }, getOwnerId: () => "owner_one" });
  await restarted.process();
  assert.equal(sent, false);
  assert.equal((await db.getOperation("crash-old")).sync_status, "SUPERSEDED");
  assert.equal(JSON.stringify((await db.getOperation("crash-old")).payload).includes("private fake OCR"), false);
});

test("repeated retry records operational backlog fields", async () => {
  const db = await new MemoryLocalDb().open();
  await db.atomicCommit({ ownerId: "owner_one", operations: [operation("backlog", { attempt_count: 4 })] });
  const engine = new SyncEngine({ db, remote: { syncObject: async () => { throw Object.assign(new Error("offline"), { code: "NETWORK" }); } }, getOwnerId: () => "owner_one", random: () => 0.5 });
  await engine.process(); const saved = await db.getOperation("backlog");
  assert.equal(saved.attempt_count, 5); assert.equal(saved.backlog_attention, true);
  assert.ok(saved.first_failed_at); assert.ok(saved.last_attempt_at); assert.ok(saved.next_retry_at); assert.equal(saved.last_error_code, "NETWORK");
});
