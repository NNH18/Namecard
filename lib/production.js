(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BCardProduction = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";
  const lib = root.BCardLib || {};
  const state = { mode: "loading", configured: false, ready: null, ownerId: "", session: null, error: null, db: null, repository: null, auth: null, sync: null, research: null, listeners: new Set(), epoch: 0 };
  const emit = event => state.listeners.forEach(listener => listener({ ...event, state }));
  state.subscribe = listener => { state.listeners.add(listener); return () => state.listeners.delete(listener); };
  state.getOwnerId = () => state.ownerId;

  state.ready = (async () => {
    const config = lib.config.browserConfig(root);
    state.config = config; state.configured = config.configured; state.mode = config.mode;
    state.db = lib.localDb.createLocalDb({ indexedDB: root.indexedDB });
    await state.db.open();
    let client = null;
    if (config.configured) client = new lib.supabase.SupabaseClient({ url: config.supabaseUrl, anonKey: config.supabaseAnonKey });
    state.client = client;
    state.auth = client ? new lib.auth.AuthManager({ client, db: state.db }) : null;
    const localOwner = config.localOwnerId || "local-development";
    state.ownerId = config.configured ? "" : localOwner;
    const imageStorage = new lib.storage.ImageStorage({ client, maxBytes: config.maxImageBytes });
    state.repository = new lib.repository.Repository({ db: state.db, imageStorage, client, getOwnerId: () => state.ownerId });
    const remote = client ? {
      syncObject: (operation, signal) => client.rpc("sync_object", { p_object_type: operation.object_type, p_object_id: operation.object_id, p_operation_type: operation.operation_type, p_expected_version: operation.expected_version, p_object_version: operation.object_version, p_idempotency_key: operation.idempotency_key, p_payload: operation.payload }, signal),
      syncImage: async (operation, signal) => {
        const image = await state.db.getImage(state.ownerId, operation.payload.image_id);
        if (!image) throw Object.assign(new Error("Không tìm thấy ảnh cục bộ"), { code: "LOCAL_IMAGE_MISSING" });
        if (operation.operation_type === "DELETE") {
          if (image.path) await imageStorage.remove(state.ownerId, [image.path], signal);
          await state.db.atomicCommit({ ownerId: state.ownerId, images: [{ ...image, blob: undefined, uploadStatus: "DELETED", lifecycle: "DELETED" }] });
        } else {
          const uploaded = await imageStorage.upload(state.ownerId, image, signal);
          await state.db.atomicCommit({ ownerId: state.ownerId, images: [uploaded] });
        }
        return client.rpc("sync_object", { p_object_type: "card_image", p_object_id: operation.object_id, p_operation_type: operation.operation_type, p_expected_version: operation.expected_version, p_object_version: operation.object_version, p_idempotency_key: operation.idempotency_key, p_payload: operation.payload }, signal);
      }
    } : {
      syncObject: async () => { throw Object.assign(new Error("Cần cấu hình Supabase"), { code: "CONFIG_REQUIRED" }); },
      syncImage: async () => { throw Object.assign(new Error("Cần cấu hình Supabase"), { code: "CONFIG_REQUIRED" }); }
    };
    state.sync = new lib.sync.SyncEngine({ db: state.db, remote, getOwnerId: () => state.ownerId, getEpoch: () => state.epoch });
    state.research = new lib.companyResearch.ResearchManager({ db: state.db, client, resolver: lib.companyResolver, getOwnerId: () => state.ownerId, getEpoch: () => state.epoch, cacheDays: config.researchCacheDays, autoEnabled: config.autoResearch });
    if (state.auth) {
      state.auth.subscribe(event => {
        const previous = state.ownerId;
        state.session = event.session;
        state.ownerId = event.session?.user?.id || "";
        state.epoch = event.epoch;
        if (previous && previous !== state.ownerId) state.sync.stop();
        if (previous !== state.ownerId) state.research?.reset();
        emit({ type: "auth", authEvent: event });
      });
      await state.auth.restore();
      if (state.ownerId) await state.sync.reconcile(state.ownerId);
    } else {
      try {
        const legacy = root.localStorage?.getItem?.("memento-p0-data-v1");
        if (legacy) {
          await state.repository.save(JSON.parse(legacy));
          root.localStorage.removeItem("memento-p0-data-v1");
        }
      } catch (error) { state.error = error; }
    }
    emit({ type: "ready" });
    return state;
  })().catch(error => { state.error = error; state.mode = "error"; emit({ type: "error", error }); return state; });
  return state;
}));
