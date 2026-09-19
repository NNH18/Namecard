(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).localDb = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DB_VERSION = 4;
  const STORES = ["snapshots", "objects", "images", "operations", "sessions", "research", "meta"];
  const clone = value => value === undefined ? undefined : (typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const ownerKey = (ownerId, id) => `${ownerId}:${id}`;
  const assertOwner = ownerId => {
    const value = String(ownerId || "").trim();
    if (!/^[a-z0-9][a-z0-9_-]{2,127}$/i.test(value)) throw new Error("owner_id không hợp lệ");
    return value;
  };
  const minimalOperationPayload = operation => ({
    object_id: operation.object_id,
    object_type: operation.object_type,
    object_version: operation.object_version,
    payload_hash: operation.payload_hash || null
  });
  const remoteVisibility = operations => {
    if (operations.some(item => item.remote_visibility === "ACKED" || item.sync_status === "COMPLETE" || item.server_ack_version != null)) return "ACKED";
    if (operations.some(item => item.remote_visibility === "MAY_HAVE_REACHED_SERVER" || item.sync_status === "IN_FLIGHT" || Number(item.attempt_count || 0) > 0)) return "MAY_HAVE_REACHED_SERVER";
    return "NEVER_DISPATCHED";
  };
  const applySupersession = ({ existingOperations, incomingOperations, objects, rules, now }) => {
    const updated = [];
    const visibilityByObject = new Map();
    for (const rule of rules) {
      const matching = existingOperations.filter(item => item.object_type === rule.objectType && item.object_id === rule.objectId);
      const visibility = remoteVisibility(matching);
      visibilityByObject.set(`${rule.objectType}:${rule.objectId}`, visibility);
      for (const operation of matching) {
        if (Number(operation.object_version || 0) >= Number(rule.beforeVersion || Number.MAX_SAFE_INTEGER)) continue;
        if (["COMPLETE", "SUPERSEDED"].includes(operation.sync_status)) continue;
        updated.push({
          ...operation,
          sync_status: "SUPERSEDED",
          payload: minimalOperationPayload(operation),
          superseded_reason: rule.reason || "NEWER_LIFECYCLE",
          superseded_at: now,
          updated_at: now
        });
      }
    }
    const preparedObjects = objects.map(item => {
      const visibility = visibilityByObject.get(`${item.objectType}:${item.objectId}`);
      return visibility ? { ...item, remoteVisibility: visibility } : item;
    });
    const preparedOperations = incomingOperations.filter(operation => {
      if (operation.dispatch_policy !== "REMOTE_IF_VISIBLE") return true;
      return visibilityByObject.get(`${operation.object_type}:${operation.object_id}`) !== "NEVER_DISPATCHED";
    }).map(operation => {
      const copy = { ...operation };
      delete copy.dispatch_policy;
      return copy;
    });
    return { updated, objects: preparedObjects, operations: preparedOperations, visibilityByObject };
  };

  class MemoryLocalDb {
    constructor() { this.stores = Object.fromEntries(STORES.map(name => [name, new Map()])); this.opened = false; }
    async open() { this.opened = true; return this; }
    async atomicCommit(args) { return this.atomicMutation(args); }
    async atomicMutation({ ownerId, snapshot, objects = [], operations = [], images = [], supersede = [], purgeImageIds = [] }) {
      assertOwner(ownerId);
      const backup = clone(this.stores);
      try {
        const now = new Date().toISOString();
        const existingOperations = [...this.stores.operations.values()].filter(item => item.ownerId === ownerId);
        const prepared = applySupersession({ existingOperations, incomingOperations: operations, objects, rules: supersede, now });
        if (snapshot !== undefined) this.stores.snapshots.set(ownerId, clone({ ownerId, data: snapshot, updatedAt: new Date().toISOString() }));
        for (const item of prepared.objects) this.stores.objects.set(ownerKey(ownerId, item.id), clone({ ...item, ownerId, key: ownerKey(ownerId, item.id) }));
        for (const item of prepared.updated) this.stores.operations.set(item.id, clone(item));
        for (const item of prepared.operations) this.stores.operations.set(item.id, clone({ ...item, ownerId }));
        for (const item of images) this.stores.images.set(ownerKey(ownerId, item.id), clone({ ...item, ownerId, key: ownerKey(ownerId, item.id) }));
        for (const id of purgeImageIds) {
          const key = ownerKey(ownerId, id);
          const image = this.stores.images.get(key);
          if (image) this.stores.images.set(key, clone({ ...image, blob: undefined, purgedAt: now }));
        }
      } catch (error) { this.stores = backup; throw error; }
      return true;
    }
    async loadSnapshot(ownerId) { return clone(this.stores.snapshots.get(assertOwner(ownerId))?.data || null); }
    async getObjects(ownerId) { ownerId = assertOwner(ownerId); return [...this.stores.objects.values()].filter(item => item.ownerId === ownerId).map(clone); }
    async getObject(ownerId, objectType, objectId) { return clone(this.stores.objects.get(ownerKey(assertOwner(ownerId), `${objectType}:${objectId}`)) || null); }
    async getImage(ownerId, id) { return clone(this.stores.images.get(ownerKey(assertOwner(ownerId), id)) || null); }
    async listImages(ownerId) { ownerId = assertOwner(ownerId); return [...this.stores.images.values()].filter(item => item.ownerId === ownerId).map(clone); }
    async deleteImage(ownerId, id) { this.stores.images.delete(ownerKey(assertOwner(ownerId), id)); }
    async listOperations(ownerId, statuses = ["PENDING", "RETRY_WAIT", "AUTH_REQUIRED"]) {
      ownerId = assertOwner(ownerId);
      return [...this.stores.operations.values()].filter(item => item.ownerId === ownerId && statuses.includes(item.sync_status)).sort((a, b) => a.created_at.localeCompare(b.created_at)).map(clone);
    }
    async getOperation(id) { return clone(this.stores.operations.get(id) || null); }
    async listObjectOperations(ownerId, objectType, objectId) { ownerId = assertOwner(ownerId); return [...this.stores.operations.values()].filter(item => item.ownerId === ownerId && item.object_type === objectType && item.object_id === objectId).map(clone); }
    async putOperation(operation) { assertOwner(operation.ownerId); this.stores.operations.set(operation.id, clone(operation)); return clone(operation); }
    async putSession(key, session) { this.stores.sessions.set(key, clone({ key, session })); }
    async getSession(key) { return clone(this.stores.sessions.get(key)?.session || null); }
    async deleteSession(key) { this.stores.sessions.delete(key); }
    async putResearch(ownerId, key, value) { ownerId = assertOwner(ownerId); this.stores.research.set(ownerKey(ownerId, key), clone({ key: ownerKey(ownerId, key), ownerId, cacheKey: key, value })); }
    async getResearch(ownerId, key) { return clone(this.stores.research.get(ownerKey(assertOwner(ownerId), key))?.value || null); }
    async clearAccount(ownerId, { preservePending = true } = {}) {
      ownerId = assertOwner(ownerId);
      for (const name of ["snapshots", "objects", "images", "research"]) for (const [key, value] of this.stores[name]) if (key === ownerId || value.ownerId === ownerId) this.stores[name].delete(key);
      if (!preservePending) for (const [key, value] of this.stores.operations) if (value.ownerId === ownerId) this.stores.operations.delete(key);
    }
    async migrateLegacy(storage, storageKey, ownerId = "legacy-unassigned") {
      const raw = storage?.getItem?.(storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      await this.atomicCommit({ ownerId, snapshot: parsed });
      storage.removeItem?.(storageKey);
      return true;
    }
  }

  const requestPromise = request => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
  const transactionPromise = transaction => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(true);
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });

  class IndexedLocalDb {
    constructor({ indexedDB = globalThis.indexedDB, dbName = "bcard-production-v1" } = {}) { this.indexedDB = indexedDB; this.dbName = dbName; this.db = null; }
    async open() {
      if (this.db) return this;
      if (!this.indexedDB) throw new Error("IndexedDB không khả dụng trên thiết bị này");
      const request = this.indexedDB.open(this.dbName, DB_VERSION);
      request.onupgradeneeded = event => {
        const db = request.result;
        for (const name of STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: name === "operations" ? "id" : "key" });
        const operations = request.transaction.objectStore("operations");
        if (!operations.indexNames.contains("owner_status")) operations.createIndex("owner_status", ["ownerId", "sync_status"], { unique: false });
        if (!operations.indexNames.contains("owner_created")) operations.createIndex("owner_created", ["ownerId", "created_at"], { unique: false });
        const images = request.transaction.objectStore("images");
        if (!images.indexNames.contains("owner")) images.createIndex("owner", "ownerId", { unique: false });
        const objects = request.transaction.objectStore("objects");
        if (!objects.indexNames.contains("owner")) objects.createIndex("owner", "ownerId", { unique: false });
        const research = request.transaction.objectStore("research");
        if (!research.indexNames.contains("owner")) research.createIndex("owner", "ownerId", { unique: false });
        request.transaction.objectStore("meta").put({ key: "schema", version: DB_VERSION, upgradedAt: new Date().toISOString(), previousVersion: event.oldVersion });
      };
      this.db = await requestPromise(request);
      this.db.onversionchange = () => { this.db.close(); this.db = null; };
      return this;
    }
    tx(names, mode = "readonly") { if (!this.db) throw new Error("Local database chưa mở"); return this.db.transaction(names, mode); }
    async atomicCommit(args) { return this.atomicMutation(args); }
    async atomicMutation({ ownerId, snapshot, objects = [], operations = [], images = [], supersede = [], purgeImageIds = [] }) {
      ownerId = assertOwner(ownerId);
      const tx = this.tx(["snapshots", "objects", "operations", "images"], "readwrite");
      const operationStore = tx.objectStore("operations");
      const existingOperations = await requestPromise(operationStore.index("owner_created").getAll(IDBKeyRange.bound([ownerId, ""], [ownerId, "\uffff"])));
      const now = new Date().toISOString();
      const prepared = applySupersession({ existingOperations, incomingOperations: operations, objects, rules: supersede, now });
      if (snapshot !== undefined) tx.objectStore("snapshots").put({ key: ownerId, ownerId, data: snapshot, updatedAt: new Date().toISOString() });
      for (const item of prepared.objects) tx.objectStore("objects").put({ ...item, ownerId, key: ownerKey(ownerId, item.id) });
      for (const item of prepared.updated) operationStore.put(item);
      for (const item of prepared.operations) operationStore.put({ ...item, ownerId });
      for (const item of images) tx.objectStore("images").put({ ...item, ownerId, key: ownerKey(ownerId, item.id) });
      for (const id of purgeImageIds) {
        const key = ownerKey(ownerId, id);
        const image = await requestPromise(tx.objectStore("images").get(key));
        if (image) tx.objectStore("images").put({ ...image, blob: undefined, purgedAt: now });
      }
      return transactionPromise(tx);
    }
    async loadSnapshot(ownerId) { const row = await requestPromise(this.tx(["snapshots"]).objectStore("snapshots").get(assertOwner(ownerId))); return row?.data || null; }
    async byOwner(storeName, ownerId) { return requestPromise(this.tx([storeName]).objectStore(storeName).index("owner").getAll(assertOwner(ownerId))); }
    async getObjects(ownerId) { return this.byOwner("objects", ownerId); }
    async getObject(ownerId, objectType, objectId) { return requestPromise(this.tx(["objects"]).objectStore("objects").get(ownerKey(assertOwner(ownerId), `${objectType}:${objectId}`))); }
    async getImage(ownerId, id) { return requestPromise(this.tx(["images"]).objectStore("images").get(ownerKey(assertOwner(ownerId), id))); }
    async listImages(ownerId) { return this.byOwner("images", ownerId); }
    async deleteImage(ownerId, id) { const tx = this.tx(["images"], "readwrite"); tx.objectStore("images").delete(ownerKey(assertOwner(ownerId), id)); return transactionPromise(tx); }
    async listOperations(ownerId, statuses = ["PENDING", "RETRY_WAIT", "AUTH_REQUIRED"]) {
      ownerId = assertOwner(ownerId);
      const rows = await requestPromise(this.tx(["operations"]).objectStore("operations").index("owner_created").getAll(IDBKeyRange.bound([ownerId, ""], [ownerId, "\uffff"])));
      return rows.filter(row => statuses.includes(row.sync_status));
    }
    async getOperation(id) { return requestPromise(this.tx(["operations"]).objectStore("operations").get(id)); }
    async listObjectOperations(ownerId, objectType, objectId) { ownerId = assertOwner(ownerId); const rows = await requestPromise(this.tx(["operations"]).objectStore("operations").index("owner_created").getAll(IDBKeyRange.bound([ownerId, ""], [ownerId, "\uffff"]))); return rows.filter(item => item.object_type === objectType && item.object_id === objectId); }
    async putOperation(operation) { assertOwner(operation.ownerId); const tx = this.tx(["operations"], "readwrite"); tx.objectStore("operations").put(operation); await transactionPromise(tx); return operation; }
    async putSession(key, session) { const tx = this.tx(["sessions"], "readwrite"); tx.objectStore("sessions").put({ key, session }); return transactionPromise(tx); }
    async getSession(key) { const row = await requestPromise(this.tx(["sessions"]).objectStore("sessions").get(key)); return row?.session || null; }
    async deleteSession(key) { const tx = this.tx(["sessions"], "readwrite"); tx.objectStore("sessions").delete(key); return transactionPromise(tx); }
    async putResearch(ownerId, key, value) { ownerId = assertOwner(ownerId); const tx = this.tx(["research"], "readwrite"); tx.objectStore("research").put({ key: ownerKey(ownerId, key), ownerId, cacheKey: key, value }); return transactionPromise(tx); }
    async getResearch(ownerId, key) { const row = await requestPromise(this.tx(["research"]).objectStore("research").get(ownerKey(assertOwner(ownerId), key))); return row?.value || null; }
    async clearAccount(ownerId, { preservePending = true } = {}) {
      ownerId = assertOwner(ownerId);
      const stores = preservePending ? ["snapshots", "objects", "images", "research"] : ["snapshots", "objects", "images", "research", "operations"];
      for (const name of stores) {
        const tx = this.tx([name], "readwrite");
        const store = tx.objectStore(name);
        const rows = name === "snapshots" ? [{ key: ownerId }] : await requestPromise(name === "operations" ? store.index("owner_created").getAll(IDBKeyRange.bound([ownerId, ""], [ownerId, "\uffff"])) : store.index("owner").getAll(ownerId));
        rows.forEach(row => store.delete(name === "operations" ? row.id : row.key));
        await transactionPromise(tx);
      }
    }
    async migrateLegacy(storage, storageKey, ownerId = "legacy-unassigned") {
      const raw = storage?.getItem?.(storageKey);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      await this.atomicCommit({ ownerId, snapshot: parsed });
      storage.removeItem?.(storageKey);
      return true;
    }
  }

  function createLocalDb(options = {}) { return options.memory || !options.indexedDB && typeof indexedDB === "undefined" ? new MemoryLocalDb() : new IndexedLocalDb(options); }

  return { DB_VERSION, MemoryLocalDb, IndexedLocalDb, createLocalDb, assertOwner, ownerKey, remoteVisibility };
}));
