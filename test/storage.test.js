const test = require("node:test");
const assert = require("node:assert/strict");
const { ImageStorage, storagePath, validateBlob } = require("../lib/storage.js");

test("private image path is owner-bound and stable", async () => {
  const blob = new Blob(["image"], { type: "image/png" }); const uploads = []; const removals = [];
  const storage = new ImageStorage({ client: { upload: async (...args) => uploads.push(args), download: async () => blob, remove: async (...args) => removals.push(args), signUrl: async () => ({ signedURL: "short" }) } });
  const image = await storage.prepare({ ownerId: "owner_one", cardId: "card_1", imageId: "front_1", side: "front", blob });
  assert.match(image.path, /^owner_one\/card_1\/front_1-/);
  await storage.upload("owner_one", image); assert.equal(uploads.length, 1);
  assert.equal((await storage.download("owner_one", image.path)).size, blob.size);
  await storage.remove("owner_one", [image.path]); assert.equal(removals.length, 1);
  await assert.rejects(() => storage.signedUrl("owner_one", image.path, 901), /thời hạn/);
  await assert.rejects(() => storage.upload("owner_two", image), /account boundary/);
});

test("image validation rejects unknown content and oversize", () => {
  assert.throws(() => validateBlob(new Blob(["x"], { type: "text/plain" })), /Định dạng/);
  assert.throws(() => storagePath("owner", "card", "image", "bad", "image/png"), /metadata/);
});
