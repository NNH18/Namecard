(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.BCardLib ||= {}).sync = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const nowIso = now => new Date(now).toISOString();
  function backoffMs(attempt, { base = 1000, max = 300000, jitter = 0.2, random = Math.random } = {}) {
    const raw = Math.min(max, base * (2 ** Math.max(0, attempt - 1)));
    return Math.round(raw * (1 - jitter + random() * jitter * 2));
  }

  function sortOperations(operations) {
    const weight = operation => operation.operation_type === "DELETE" || operation.operation_type === "RESTRICT" ? -100 : ({ contact: 10, event: 10, tenant_company: 10, card: 20, contact_method: 30, contact_company: 30, note: 30, encounter: 40, card_image: 50, update_proposal: 60, field_provenance: 70 }[operation.object_type] || 80);
    const pending = [...operations].sort((a, b) => weight(a) - weight(b) || a.created_at.localeCompare(b.created_at));
    const ids = new Set(pending.map(item => item.id));
    const result = [];
    while (pending.length) {
      const index = pending.findIndex(item => (item.dependencies || []).every(dependency => !ids.has(dependency) || result.some(done => done.id === dependency)));
      if (index < 0) throw new Error("SYNC_DEPENDENCY_CYCLE");
      result.push(pending.splice(index, 1)[0]);
    }
    return result;
  }

  class SyncEngine {
    constructor({ db, remote, getOwnerId, getEpoch = () => 0, now = Date.now, random = Math.random }) {
      this.db = db; this.remote = remote; this.getOwnerId = getOwnerId; this.getEpoch = getEpoch; this.now = now; this.random = random; this.running = null; this.controller = null;
    }
    stop() { this.controller?.abort(); this.controller = null; }
    async reconcile(ownerId) {
      const inflight = await this.db.listOperations(ownerId, ["IN_FLIGHT"]);
      for (const operation of inflight) await this.db.putOperation({ ...operation, sync_status: "RETRY_WAIT", next_retry_at: nowIso(this.now()), updated_at: nowIso(this.now()), last_error_code: "INTERRUPTED" });
      return inflight.length;
    }
    async process({ manual = false } = {}) {
      if (this.running) return this.running;
      this.running = this._process(manual).finally(() => { this.running = null; });
      return this.running;
    }
    async _process(manual) {
      const ownerId = this.getOwnerId();
      if (!ownerId) return { processed: 0, blocked: "AUTH_REQUIRED" };
      const epoch = this.getEpoch();
      this.controller?.abort(); this.controller = new AbortController();
      const statuses = manual ? ["PENDING", "RETRY_WAIT", "AUTH_REQUIRED"] : ["PENDING", "RETRY_WAIT"];
      const queued = sortOperations(await this.db.listOperations(ownerId, statuses));
      const completed = new Set(); let processed = 0;
      for (const initial of queued) {
        if (this.controller.signal.aborted || this.getOwnerId() !== ownerId || this.getEpoch() !== epoch) break;
        const operation = await this.db.getOperation(initial.id) || initial;
        if (operation.lifecycle && operation.lifecycle !== "ACTIVE" && !["DELETE", "RESTRICT"].includes(operation.operation_type)) {
          await this.db.putOperation({ ...operation, sync_status: "SUPERSEDED", updated_at: nowIso(this.now()), last_error_code: "LIFECYCLE_SUPERSEDED" });
          continue;
        }
        if (!manual && operation.next_retry_at && Date.parse(operation.next_retry_at) > this.now()) continue;
        const unsatisfied = (operation.dependencies || []).some(dependency => !completed.has(dependency) && queued.some(item => item.id === dependency));
        if (unsatisfied) continue;
        const inFlight = { ...operation, sync_status: "IN_FLIGHT", attempt_count: Number(operation.attempt_count || 0) + 1, updated_at: nowIso(this.now()) };
        await this.db.putOperation(inFlight);
        try {
          const result = operation.object_type === "card_image" ? await this.remote.syncImage(inFlight, this.controller.signal) : await this.remote.syncObject(inFlight, this.controller.signal);
          if (this.getOwnerId() !== ownerId || this.getEpoch() !== epoch) continue;
          await this.db.putOperation({ ...inFlight, sync_status: "COMPLETE", server_ack_version: Number(result?.version ?? operation.object_version), next_retry_at: null, last_error_code: null, updated_at: nowIso(this.now()) });
          completed.add(operation.id); processed += 1;
        } catch (error) {
          if (this.getOwnerId() !== ownerId || this.getEpoch() !== epoch) continue;
          const code = error?.code || (error?.status === 401 ? "AUTH_REQUIRED" : error?.status === 409 ? "CONFLICT" : "REMOTE_ERROR");
          if (code === "CONFLICT" || error?.status === 409) {
            await this.db.putOperation({ ...inFlight, sync_status: "CONFLICT", last_error_code: "STALE_VERSION", conflict: error.details || null, updated_at: nowIso(this.now()) });
          } else if (code === "AUTH_REQUIRED" || error?.status === 401) {
            await this.db.putOperation({ ...inFlight, sync_status: "AUTH_REQUIRED", last_error_code: "AUTH_REQUIRED", updated_at: nowIso(this.now()) });
            break;
          } else {
            const retry = backoffMs(inFlight.attempt_count, { random: this.random });
            await this.db.putOperation({ ...inFlight, sync_status: "RETRY_WAIT", last_error_code: code, next_retry_at: nowIso(this.now() + retry), updated_at: nowIso(this.now()) });
          }
        }
      }
      return { processed, remaining: (await this.db.listOperations(ownerId, ["PENDING", "RETRY_WAIT", "AUTH_REQUIRED", "CONFLICT"])).length };
    }
  }

  return { backoffMs, sortOperations, SyncEngine };
}));
