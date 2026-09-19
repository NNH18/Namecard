const test = require("node:test");
const assert = require("node:assert/strict");
const { MemoryLocalDb } = require("../lib/local-db.js");
const { Repository } = require("../lib/repository.js");
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

test("card deletion creates an image tombstone instead of re-uploading content", async () => {
  const db = await new MemoryLocalDb().open();
  const imageStorage = new ImageStorage({ client: {} });
  const repository = new Repository({ db, imageStorage, getOwnerId: () => "owner_one" });
  const first = snapshot(); first.cards[0].front = "data:image/png;base64,AA==";
  await repository.save(first);
  const deleted = await repository.load(); deleted.cards[0].lifecycle = "DELETED"; deleted.cards[0].front = "";
  await repository.save(deleted);
  const image = await db.getImage("owner_one", "card_1_front");
  const operations = await db.listOperations("owner_one");
  assert.equal(image.lifecycle, "DELETED");
  assert.ok(operations.some(item => item.object_type === "card_image" && item.operation_type === "DELETE"));
});
