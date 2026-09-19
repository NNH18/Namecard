(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).repository = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const clone = value => value === undefined ? undefined : (typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value)));
  const nowIso = now => new Date(now()).toISOString();
  const clean = value => String(value ?? "").trim();
  const stableStringify = value => {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  };
  const tinyHash = value => {
    let hash = 2166136261;
    for (const byte of new TextEncoder().encode(stableStringify(value))) hash = Math.imul(hash ^ byte, 16777619);
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  const operationId = ({ ownerId, objectType, objectId, version, operationType }) => `${ownerId}:${objectType}:${objectId}:v${version}:${operationType}`;
  const row = (type, id, version, lifecycle, payload) => ({ id: `${type}:${id}`, objectType: type, objectId: id, version: Number(version || 1), lifecycle: lifecycle || "ACTIVE", payload, payloadHash: tinyHash(payload) });

  function flattenSnapshot(snapshot) {
    const rows = [];
    for (const event of snapshot.events || []) rows.push(row("event", event.id, event.version, event.lifecycle, { ...event }));
    for (const contact of snapshot.contacts || []) {
      const base = { ...contact };
      delete base.methods; delete base.relationships; delete base.notes; delete base.cards; delete base.encounters; delete base.tags;
      rows.push(row("contact", contact.id, contact.version, contact.lifecycle, base));
      for (const method of contact.methods || []) rows.push(row("contact_method", method.id, method.version, method.status === "ACTIVE" ? "ACTIVE" : method.status, { ...method, contact_id: contact.id }));
      for (const relationship of contact.relationships || []) {
        const companyId = relationship.companyId || `company_${relationship.id}`;
        rows.push(row("tenant_company", companyId, relationship.companyVersion, relationship.companyLifecycle, { id: companyId, name: relationship.company, website: relationship.website || "" }));
        rows.push(row("contact_company", relationship.id, relationship.version, relationship.status, { ...relationship, contact_id: contact.id, company_id: companyId }));
      }
      for (const method of contact.methods || []) if (method.source) rows.push(row("field_provenance", `prov_${method.id}`, method.version, method.status, { id: `prov_${method.id}`, object_type: "contact_method", object_id: method.id, field_name: "value", source_type: String(method.source).startsWith("Card #") ? "CARD_OCR" : "USER_INPUT", source_id: method.source, value_hash: tinyHash(method.value) }));
      for (const relationship of contact.relationships || []) if (relationship.source) rows.push(row("field_provenance", `prov_${relationship.id}`, relationship.version, relationship.status, { id: `prov_${relationship.id}`, object_type: "contact_company", object_id: relationship.id, field_name: "relationship", source_type: String(relationship.source).startsWith("Card #") ? "CARD_OCR" : "USER_INPUT", source_id: relationship.source, value_hash: tinyHash([relationship.company, relationship.role, relationship.website]) }));
      for (const note of contact.notes || []) rows.push(row("note", note.id, note.version, note.lifecycle, { ...note, contact_id: contact.id }));
      for (const encounter of contact.encounters || []) rows.push(row("encounter", encounter.id, encounter.version, encounter.lifecycle, { ...encounter, contact_id: contact.id }));
      for (const tagName of contact.tags || []) {
        const tagId = `tag_${tinyHash(tagName.toLocaleLowerCase("vi"))}`;
        rows.push(row("tag", tagId, 1, "ACTIVE", { id: tagId, name: tagName }));
        rows.push(row("contact_tag", `${contact.id}_${tagId}`, 1, "ACTIVE", { id: `${contact.id}_${tagId}`, contact_id: contact.id, tag_id: tagId }));
      }
    }
    for (const card of snapshot.cards || []) {
      const payload = { ...card }; delete payload.front; delete payload.back;
      rows.push(row("card", card.id, card.version, card.lifecycle, payload));
    }
    for (const proposal of snapshot.proposals || []) rows.push(row("update_proposal", proposal.id, proposal.version, proposal.lifecycle, { ...proposal, contact_id: proposal.contactId }));
    const deduped = new Map();
    for (const item of rows) deduped.set(item.id, item);
    return [...deduped.values()];
  }

  function dataUrlToBlob(value) {
    if (!value || typeof value !== "string" || !value.startsWith("data:")) return null;
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(value);
    if (!match) return null;
    const binary = typeof atob === "function" ? atob(match[2]) : Buffer.from(match[2], "base64").toString("binary");
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: match[1] });
  }

  async function blobToDataUrl(blob) {
    if (!blob) return "";
    if (typeof FileReader !== "undefined") return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob); });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`;
  }

  class Repository {
    constructor({ db, imageStorage, client = null, getOwnerId, now = Date.now }) { this.db = db; this.imageStorage = imageStorage; this.client = client; this.getOwnerId = getOwnerId; this.now = now; }
    owner() { const value = this.getOwnerId?.(); if (!value) throw Object.assign(new Error("Cần đăng nhập"), { code: "AUTH_REQUIRED" }); return value; }
    async load() {
      const ownerId = this.owner();
      const snapshot = await this.db.loadSnapshot(ownerId);
      if (!snapshot) return null;
      const hydrated = clone(snapshot);
      for (const card of hydrated.cards || []) {
        for (const side of ["front", "back"]) {
          const image = await this.db.getImage(ownerId, `${card.id}_${side}`);
          card[side] = image?.blob ? await blobToDataUrl(image.blob) : "";
        }
      }
      return hydrated;
    }
    async save(snapshot) {
      const ownerId = this.owner();
      const saved = clone(snapshot);
      saved.settings = { ...(saved.settings || {}), accountId: ownerId };
      const images = [];
      for (const card of saved.cards || []) {
        for (const side of ["front", "back"]) {
          const blob = dataUrlToBlob(card[side]);
          const imageId = `${card.id}_${side}`;
          const previousImage = await this.db.getImage(ownerId, imageId);
          if (blob && this.imageStorage) {
            const prepared = await this.imageStorage.prepare({ ownerId, cardId: card.id, imageId, side, blob, lifecycle: card.lifecycle || "ACTIVE" });
            prepared.version = previousImage ? Number(previousImage.version || 0) + (previousImage.checksum === prepared.checksum && previousImage.lifecycle === prepared.lifecycle ? 0 : 1) : 1;
            if (!previousImage || previousImage.checksum !== prepared.checksum || previousImage.lifecycle !== prepared.lifecycle) images.push(prepared);
          } else if (previousImage && ["DELETED", "RESTRICTED"].includes(card.lifecycle) && previousImage.lifecycle !== card.lifecycle) {
            images.push({ ...previousImage, blob: undefined, lifecycle: card.lifecycle, uploadStatus: "PENDING", version: Number(previousImage.version || 1) + 1 });
          }
          delete card[side];
          card[`${side}ImageId`] = blob || previousImage ? imageId : card[`${side}ImageId`] || "";
        }
      }
      const current = new Map((await this.db.getObjects(ownerId)).map(item => [item.id, item]));
      const objects = flattenSnapshot(saved);
      const operations = [];
      const objectOperations = new Map();
      for (const item of objects) {
        const previous = current.get(item.id);
        if (previous?.payloadHash === item.payloadHash && previous?.lifecycle === item.lifecycle) continue;
        const operationType = ["DELETED", "REVOKED"].includes(item.lifecycle) ? "DELETE" : item.lifecycle === "RESTRICTED" ? "RESTRICT" : "UPSERT";
        const expectedVersion = previous ? Number(previous.version || 0) : 0;
        const version = Math.max(Number(item.version || 1), expectedVersion + 1);
        item.version = version;
        const id = operationId({ ownerId, objectType: item.objectType, objectId: item.objectId, version, operationType });
        const dependencies = [];
        operations.push({ id, ownerId, object_type: item.objectType, object_id: item.objectId, object_version: version, expected_version: expectedVersion, operation_type: operationType, idempotency_key: id, payload: item.payload, lifecycle: item.lifecycle, dependencies, sync_status: "PENDING", attempt_count: 0, next_retry_at: null, created_at: nowIso(this.now), updated_at: nowIso(this.now) });
        objectOperations.set(item.id, id);
      }
      const dependentParents = { contact_method: ["contact"], contact_company: ["contact", "tenant_company"], note: ["contact"], encounter: ["contact", "event", "card"], contact_tag: ["contact", "tag"], card: ["contact", "event"], update_proposal: ["contact"] };
      for (const operation of operations) {
        for (const parentType of dependentParents[operation.object_type] || []) {
          const parentId = parentType === "contact" ? operation.payload.contact_id || operation.payload.contactId : parentType === "tenant_company" ? operation.payload.company_id : parentType === "event" ? operation.payload.event_id : parentType === "card" ? operation.payload.cardId || operation.payload.card_id : operation.payload.tag_id;
          const parentOperation = objectOperations.get(`${parentType}:${parentId}`);
          if (parentOperation) operation.dependencies.push(parentOperation);
        }
      }
      for (const image of images) {
        const cardOperation = objectOperations.get(`card:${image.cardId}`);
        const operationType = image.lifecycle === "ACTIVE" ? "UPSERT" : image.lifecycle === "RESTRICTED" ? "RESTRICT" : "DELETE";
        const id = operationId({ ownerId, objectType: "card_image", objectId: image.id, version: image.version, operationType });
        operations.push({ id, ownerId, object_type: "card_image", object_id: image.id, object_version: image.version, expected_version: Math.max(0, Number(image.version || 1) - 1), operation_type: operationType, idempotency_key: id, payload: { image_id: image.id, card_id: image.cardId, side: image.side, path: image.path, checksum: image.checksum, size_bytes: image.size, content_type: image.contentType }, lifecycle: image.lifecycle, dependencies: cardOperation ? [cardOperation] : [], sync_status: "PENDING", attempt_count: 0, next_retry_at: null, created_at: nowIso(this.now), updated_at: nowIso(this.now) });
      }
      await this.db.atomicCommit({ ownerId, snapshot: saved, objects, operations, images });
      return { ownerId, objects: objects.length, queued: operations.length, images: images.length };
    }
    async exportData() {
      const ownerId = this.owner();
      if (this.client) {
        try { return await this.client.rpc("export_account_data", {}); }
        catch { /* Offline export falls back to the same owner-scoped durable cache. */ }
      }
      const snapshot = await this.load();
      return { schemaVersion: 1, exportedAt: nowIso(this.now), ownerId, data: snapshot || { settings: { accountId: ownerId }, contacts: [], cards: [], events: [], proposals: [] } };
    }
    async pullRemote() {
      const ownerId = this.owner();
      if (!this.client) throw Object.assign(new Error("Cần cấu hình Supabase"), { code: "CONFIG_REQUIRED" });
      const tables = ["events", "contacts", "contact_methods", "tenant_companies", "contact_companies", "cards", "card_images", "encounters", "notes", "tags", "contact_tags", "update_proposals"];
      const values = await Promise.all(tables.map(table => this.client.rest(table, { query: "select=*" })));
      const remote = Object.fromEntries(tables.map((table, index) => [table, Array.isArray(values[index]) ? values[index] : []]));
      const companies = new Map(remote.tenant_companies.map(item => [item.id, item]));
      const methods = new Map(); for (const item of remote.contact_methods.filter(item => item.lifecycle === "ACTIVE")) (methods.get(item.contact_id) || methods.set(item.contact_id, []).get(item.contact_id)).push({ id: item.id, kind: item.kind, label: item.label, value: item.value, preferred: item.preferred, confirmed: item.confirmed, source: item.source, status: item.lifecycle, version: item.version });
      const relationships = new Map(); for (const item of remote.contact_companies.filter(item => item.lifecycle === "ACTIVE")) { const company = companies.get(item.company_id) || {}; (relationships.get(item.contact_id) || relationships.set(item.contact_id, []).get(item.contact_id)).push({ id: item.id, companyId: item.company_id, company: company.name || "", role: item.role, primary: item.is_primary, website: company.website || "", source: item.source, status: item.lifecycle, version: item.version, companyVersion: company.version }); }
      const notes = new Map(); for (const item of remote.notes.filter(item => item.lifecycle === "ACTIVE")) (notes.get(item.contact_id) || notes.set(item.contact_id, []).get(item.contact_id)).push({ id: item.id, text: item.body, date: item.updated_at, sync: "COMPLETE", version: item.version, lifecycle: item.lifecycle });
      const encounters = new Map(); for (const item of remote.encounters.filter(item => item.lifecycle === "ACTIVE")) (encounters.get(item.contact_id) || encounters.set(item.contact_id, []).get(item.contact_id)).push({ id: item.id, event_id: item.event_id || "", event: item.context || "", date: item.occurred_at || item.created_at, source: "SERVER", cardId: item.source_card_id || "", version: item.version, lifecycle: item.lifecycle });
      const tagNames = new Map(remote.tags.filter(item => item.lifecycle === "ACTIVE").map(item => [item.id, item.name]));
      const tags = new Map(); for (const item of remote.contact_tags.filter(item => item.lifecycle === "ACTIVE")) { const name = tagNames.get(item.tag_id); if (name) (tags.get(item.contact_id) || tags.set(item.contact_id, []).get(item.contact_id)).push(name); }
      const cardsByContact = new Map(); for (const item of remote.cards.filter(item => item.lifecycle !== "DELETED")) (cardsByContact.get(item.contact_id) || cardsByContact.set(item.contact_id, []).get(item.contact_id)).push(item.id);
      const contacts = remote.contacts.filter(item => item.lifecycle !== "DELETED").map(item => ({ id: item.id, name: item.name, initials: item.initials, personalUrl: item.personal_url || "", draft: item.draft, methods: methods.get(item.id) || [], relationships: relationships.get(item.id) || [], tags: tags.get(item.id) || [], event: (encounters.get(item.id) || [])[0]?.event || "Không có sự kiện", encounters: encounters.get(item.id) || [], notes: notes.get(item.id) || [], cards: cardsByContact.get(item.id) || [], version: item.version, sync: "COMPLETE", lifecycle: item.lifecycle, incident: "NONE", lastMet: (encounters.get(item.id) || [])[0]?.date || "—" }));
      const events = remote.events.filter(item => item.lifecycle !== "DELETED").map(item => ({ id: item.id, name: item.name, date: item.event_date || "", place: item.place || "", contacts: 0, version: item.version, lifecycle: item.lifecycle }));
      const cards = remote.cards.filter(item => item.lifecycle !== "DELETED").map(item => ({ ...(item.snapshot || {}), id: item.id, contactId: item.contact_id || item.snapshot?.contactId || "", event_id: item.event_id || "", code: item.code, acceptance: item.acceptance, reviewStatus: item.review_status, lifecycle: item.lifecycle, version: item.version, sync: "COMPLETE", front: "", back: "" }));
      const proposals = remote.update_proposals.map(item => ({ id: item.id, contactId: item.contact_id, kind: item.proposal_type, target: item.target_type, targetId: item.target_id || "", value: item.proposed_value?.value ?? "", metadata: item.proposed_value?.metadata || {}, targetVersion: item.target_version, status: item.status === "APPROVED" ? "ACCEPTED" : item.status, version: item.version, lifecycle: item.lifecycle }));
      const snapshot = { settings: { accountId: ownerId, online: true, activeEventId: events[0]?.id || "", autoResearch: true, lastSync: new Date(this.now()).toISOString() }, events, contacts, cards, proposals };
      const images = [];
      for (const image of remote.card_images.filter(item => item.lifecycle === "ACTIVE" && item.upload_status === "COMPLETE")) {
        try {
          const blob = await this.imageStorage?.download(ownerId, image.storage_path);
          if (blob) images.push({ id: image.id, cardId: image.card_id, side: image.side, blob, checksum: image.checksum, size: image.size_bytes, contentType: image.content_type, path: image.storage_path, lifecycle: image.lifecycle, uploadStatus: image.upload_status, version: image.version });
        } catch { /* Metadata remains usable; private image can retry on the next reconciliation. */ }
      }
      const objects = flattenSnapshot(snapshot);
      const versions = new Map(); for (const [table, items] of Object.entries(remote)) for (const item of items) versions.set(`${table.replace(/s$/, "")}:${item.id}`, item.version);
      for (const item of objects) { const version = versions.get(item.id); if (version) item.version = version; }
      await this.db.atomicCommit({ ownerId, snapshot: { ...snapshot, cards: snapshot.cards.map(card => { const copy = { ...card }; delete copy.front; delete copy.back; return copy; }) }, objects, images });
      return this.load();
    }
    async createDataRequest({ type, email, scope }) {
      const ownerId = this.owner();
      const id = `dsr_${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${this.now()}_${Math.random().toString(36).slice(2)}`}`;
      const item = row("data_request", id, 1, "ACTIVE", { id, request_type: clean(type), verification_email: clean(email).toLowerCase(), scope: clean(scope), status: "PENDING", requested_at: nowIso(this.now) });
      const operationType = "UPSERT";
      const opId = operationId({ ownerId, objectType: item.objectType, objectId: item.objectId, version: 1, operationType });
      await this.db.atomicCommit({ ownerId, objects: [item], operations: [{ id: opId, ownerId, object_type: item.objectType, object_id: item.objectId, object_version: 1, expected_version: 0, operation_type: operationType, idempotency_key: opId, payload: item.payload, lifecycle: "ACTIVE", dependencies: [], sync_status: "PENDING", attempt_count: 0, created_at: nowIso(this.now), updated_at: nowIso(this.now) }] });
      return item.payload;
    }
  }

  return { Repository, flattenSnapshot, dataUrlToBlob, blobToDataUrl, stableStringify, tinyHash, operationId };
}));
