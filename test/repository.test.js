const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");
const { Repository, flattenSnapshot } = require("../lib/repository.js");
const { ImageStorage } = require("../lib/storage.js");

const snapshot = () => ({ settings: {}, events: [{ id: "event_1", name: "Test" }], contacts: [{ id: "contact_1", name: "Person", methods: [{ id: "method_1", kind: "EMAIL", value: "person@example.test", status: "ACTIVE" }], relationships: [], notes: [], encounters: [], tags: [], cards: ["card_1"], version: 1, lifecycle: "ACTIVE" }], cards: [{ id: "card_1", contactId: "contact_1", event: "Test", version: 1, lifecycle: "ACTIVE", front: "", back: "" }], proposals: [] });

test("repository commits snapshot and operations atomically with stable idempotency", async () => {
  const db = await new MemoryLocalDb().open(); const repository = new Repository({ db, getOwnerId: () => "owner_one" });
  const first = await repository.save(snapshot()); const second = await repository.save(snapshot());
  assert.ok(first.queued >= 3); assert.equal(second.queued, 0);
  const operations = await db.listOperations("owner_one");
  assert.equal(new Set(operations.map(item => item.idempotency_key)).size, operations.length);
  assert.equal((await repository.load()).settings.accountId, "owner_one");
});

test("repository exports only current account", async () => {
  const db = await new MemoryLocalDb().open(); let owner = "owner_one";
  const repository = new Repository({ db, getOwnerId: () => owner }); await repository.save(snapshot());
  owner = "owner_two"; await repository.save({ settings: {}, events: [], contacts: [], cards: [], proposals: [] });
  assert.equal((await repository.exportData()).ownerId, "owner_two");
  assert.equal((await repository.exportData()).data.contacts.length, 0);
});

test("repository rebuilds an account-scoped snapshot from server rows", async () => {
  const db = await new MemoryLocalDb().open();
  const rows = {
    events: [{ id: "event_1", name: "Event", event_date: "2026-09-20", place: "City", lifecycle: "ACTIVE", version: 1 }],
    contacts: [{ id: "contact_1", name: "Person", initials: "P", personal_url: "", draft: false, lifecycle: "ACTIVE", version: 2 }],
    contact_methods: [{ id: "method_1", contact_id: "contact_1", kind: "EMAIL", value: "person@example.test", label: "Work", preferred: true, confirmed: true, source: "Card", lifecycle: "ACTIVE", version: 1 }],
    tenant_companies: [], contact_companies: [],
    cards: [{ id: "card_1", contact_id: "contact_1", event_id: "event_1", code: "NC-1", snapshot: { name: "Person", event: "Event" }, acceptance: "LOCAL_ACCEPTED", review_status: "USER_CONFIRMED", lifecycle: "ACTIVE", version: 1 }],
    card_images: [], encounters: [], notes: [], tags: [], contact_tags: [], update_proposals: []
  };
  const client = { rest: async table => rows[table] };
  const repository = new Repository({ db, client, getOwnerId: () => "owner_one" });
  const pulled = await repository.pullRemote();
  assert.equal(pulled.contacts[0].methods[0].value, "person@example.test");
  assert.equal(pulled.cards[0].contactId, "contact_1");
  assert.equal((await db.listOperations("owner_one")).length, 0);
});

test("delete before first sync atomically supersedes card/image PII and purges the local blob", async () => {
  const db = await new MemoryLocalDb().open();
  const imageStorage = new ImageStorage({ client: {} });
  const repository = new Repository({ db, imageStorage, getOwnerId: () => "owner_one" });
  const first = snapshot(); first.cards[0].front = "data:image/png;base64,AA==";
  await repository.save(first);
  const deleted = await repository.load(); deleted.cards[0].lifecycle = "DELETED"; deleted.cards[0].front = "";
  await repository.save(deleted);
  const image = await db.getImage("owner_one", "card_1_front");
  const operations = await db.listOperations("owner_one", ["PENDING", "SUPERSEDED", "COMPLETE"]);
  assert.equal(image.lifecycle, "DELETED");
  assert.equal(image.blob, undefined);
  assert.equal(operations.some(item => ["card", "card_image"].includes(item.object_type) && item.operation_type === "DELETE"), false);
  const superseded = operations.filter(item => ["card", "card_image"].includes(item.object_type) && item.operation_type === "UPSERT");
  assert.equal(superseded.length, 2);
  assert.ok(superseded.every(item => item.sync_status === "SUPERSEDED"));
  assert.ok(superseded.every(item => !JSON.stringify(item.payload).includes("Person")));
});

test("delete after an in-flight card queues remote cleanup without re-uploading old PII", async () => {
  const db = await new MemoryLocalDb().open();
  const repository = new Repository({ db, getOwnerId: () => "owner_one" });
  await repository.save(snapshot());
  const upsert = (await db.listObjectOperations("owner_one", "card", "card_1"))[0];
  await db.putOperation({ ...upsert, sync_status: "IN_FLIGHT", attempt_count: 1, remote_visibility: "MAY_HAVE_REACHED_SERVER" });
  const deleted = await repository.load(); deleted.cards[0].lifecycle = "DELETED";
  await repository.save(deleted);
  const operations = await db.listObjectOperations("owner_one", "card", "card_1");
  assert.equal(operations.find(item => item.operation_type === "UPSERT").sync_status, "SUPERSEDED");
  const remove = operations.find(item => item.operation_type === "DELETE");
  assert.ok(remove);
  assert.deepEqual(remove.payload, { id: "card_1", lifecycle: "DELETED" });
});

test("provenance keeps stable card IDs, multiple sources and confirmation metadata", () => {
  const data = snapshot();
  data.cards.push({ id: "card_2", code: "NC-2", contactId: "contact_1", lifecycle: "ACTIVE", version: 1 });
  data.contacts[0].methods[0].confirmed = true;
  data.contacts[0].methods[0].confirmedAt = "2026-09-20T00:00:00.000Z";
  data.contacts[0].methods[0].provenanceSources = [
    { sourceType: "CARD", sourceObjectId: "card_1", sourceVersion: 1 },
    { sourceType: "CARD", sourceObjectId: "card_2", sourceVersion: 1 }
  ];
  const provenance = flattenSnapshot(data).filter(item => item.objectType === "field_provenance" && item.payload.target_object_id === "method_1");
  assert.deepEqual(provenance.map(item => item.payload.source_object_id).sort(), ["card_1", "card_2"]);
  assert.ok(provenance.every(item => item.payload.confirmed === true));
  data.cards[0].lifecycle = "DELETED";
  const afterDelete = flattenSnapshot(data).filter(item => item.objectType === "field_provenance" && item.payload.target_object_id === "method_1");
  assert.ok(afterDelete.some(item => item.payload.source_object_id === "card_2"));
});

test("remote pull restores value-level provenance after reinstall", async () => {
  const db = await new MemoryLocalDb().open();
  const rows = {
    events: [], contacts: [{ id: "contact_1", name: "Fake Person", initials: "FP", personal_url: "", draft: false, lifecycle: "ACTIVE", version: 1 }],
    contact_methods: [{ id: "method_1", contact_id: "contact_1", kind: "EMAIL", value: "person@example.test", normalized_value: "person@example.test", label: "Work", preferred: true, confirmed: true, source: "", lifecycle: "ACTIVE", version: 1 }],
    tenant_companies: [], contact_companies: [], cards: [
      { id: "card_a", contact_id: "contact_1", code: "NC-A", snapshot: {}, acceptance: "LOCAL_ACCEPTED", review_status: "USER_CONFIRMED", lifecycle: "ACTIVE", version: 1 },
      { id: "card_b", contact_id: "contact_1", code: "NC-B", snapshot: {}, acceptance: "LOCAL_ACCEPTED", review_status: "USER_CONFIRMED", lifecycle: "ACTIVE", version: 1 }
    ], card_images: [], encounters: [], notes: [], tags: [], contact_tags: [], update_proposals: [],
    field_provenance: [
      { id: "prov_a", target_object_type: "contact_method", target_object_id: "method_1", field_name: "value", source_type: "CARD", source_object_id: "card_a", source_version: 1, confirmed: true, lifecycle: "ACTIVE", version: 1 },
      { id: "prov_b", target_object_type: "contact_method", target_object_id: "method_1", field_name: "value", source_type: "CARD", source_object_id: "card_b", source_version: 1, confirmed: true, lifecycle: "ACTIVE", version: 1 }
    ]
  };
  const repository = new Repository({ db, client: { rest: async table => rows[table] || [] }, getOwnerId: () => "owner_one" });
  const pulled = await repository.pullRemote();
  assert.deepEqual(pulled.contacts[0].methods[0].provenanceSources.map(item => item.sourceObjectId).sort(), ["card_a", "card_b"]);
  assert.equal(pulled.contacts[0].methods[0].source, "Card #NC-A");
});
