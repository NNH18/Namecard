const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const logic = require("../logic.js");

function createClassList() {
  return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
}

function createElement() {
  return {
    hidden: false, innerHTML: "", textContent: "", dataset: {}, className: "", classList: createClassList(),
    appendChild() {}, remove() {}, setAttribute() {}, removeAttribute() {}, focus() {}, addEventListener() {},
    querySelectorAll() { return []; }
  };
}

function createAppSandbox() {
  const elements = new Map();
  const storage = {
    fail: false,
    values: new Map(),
    getItem(key) { return this.values.get(key) ?? null; },
    setItem(key, value) {
      if (this.fail) throw new DOMException("Quota full", "QuotaExceededError");
      this.values.set(key, value);
    }
  };
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, createElement());
      return elements.get(id);
    },
    createElement,
    querySelectorAll() { return []; }
  };
  const chain = {
    off() { return this; }, on() { return this; }, removeClass() { return this; }, filter() { return this; },
    addClass() { return this; }, toggleClass() { return this; }, attr() { return this; }, html() { return this; },
    val() { return this; }, trigger() { return this; }, find() { return this; }, each() { return this; }
  };
  const sandbox = {
    console: { ...console, error() {}, warn() {} }, DOMException, Blob, URL, Date,
    setTimeout() { return 0; }, clearTimeout() {},
    document, localStorage: storage, navigator: {},
    window: {
      BCardLogic: logic,
      matchMedia() { return { matches: false }; },
      scrollTo() {}, location: { href: "" },
      setTimeout() { return 0; }
    },
    $() { return chain; }
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8"), sandbox, { filename: "app.js" });
  return { sandbox, storage };
}

test("commitMutation rollback khi localStorage ném QuotaExceededError", () => {
  const { sandbox, storage } = createAppSandbox();
  storage.fail = true;
  const result = vm.runInContext(`(() => {
    const before = data.settings.online;
    const saved = commitMutation(() => { data.settings.online = !before; });
    return { before, after: data.settings.online, saved };
  })()`, sandbox);
  assert.equal(result.saved, false);
  assert.equal(result.after, result.before);
});

test("commitMutation rollback khi mutator ném lỗi", () => {
  const { sandbox } = createAppSandbox();
  const result = vm.runInContext(`(() => {
    const before = data.contacts.length;
    const saved = commitMutation(() => { data.contacts.pop(); throw new Error("forced"); });
    return { before, after: data.contacts.length, saved };
  })()`, sandbox);
  assert.equal(result.saved, false);
  assert.equal(result.after, result.before);
});

test("persistScan attach chỉ tạo proposal và giữ nguyên contact methods", () => {
  const { sandbox } = createAppSandbox();
  vm.runInContext(`closeModal = () => {}; setRoute = () => {}; toast = () => {};`, sandbox);
  const result = vm.runInContext(`(() => {
    const contact = data.contacts.find(item => item.id === "ct_anh");
    const before = JSON.stringify(contact.methods);
    persistScan(
      { front: "data:image/png;base64,AA==", back: "", backBlank: true },
      { name: "Trần Minh Anh", role: "CEO", company: "Nova Solutions", eventName: "Vietnam Innovation Summit", phone: "+84 903 456 789", email: "new@nova.vn", website: "novasolutions.vn", note: "", personalUrl: "", removeTargets: [] },
      "ct_anh"
    );
    return {
      methodsUnchanged: before === JSON.stringify(contact.methods),
      hasCard: contact.cards.some(id => id.startsWith("card_")),
      proposals: data.proposals.filter(item => item.contactId === "ct_anh" && item.status === "PENDING").map(item => item.kind)
    };
  })()`, sandbox);
  assert.equal(result.methodsUnchanged, true);
  assert.equal(result.hasCard, true);
  assert.ok(result.proposals.includes("ADD"));
  assert.ok(result.proposals.includes("UPDATE"));
});

test("applyApprovedProposal REMOVE đổi status thành REVOKED và không xóa vật lý", () => {
  const { sandbox } = createAppSandbox();
  const result = vm.runInContext(`(() => {
    const contact = data.contacts.find(item => item.id === "ct_anh");
    const method = contact.methods[0];
    const before = contact.methods.length;
    applyApprovedProposal(contact, { kind: "REMOVE", target: method.kind, targetId: method.id, value: method.value, source: "Card #TEST" });
    return { before, after: contact.methods.length, status: method.status };
  })()`, sandbox);
  assert.equal(result.after, result.before);
  assert.equal(result.status, "REVOKED");
});

test("persistScan giữ raw OCR và correction tách khỏi dữ liệu đã xác nhận", () => {
  const { sandbox } = createAppSandbox();
  vm.runInContext(`closeModal = () => {}; setRoute = () => {}; toast = () => {};`, sandbox);
  const result = vm.runInContext(`(() => {
    persistScan(
      { front: "data:image/png;base64,AA==", back: "", backBlank: true },
      { name: "Trần Minh Anh", role: "Giám đốc", company: "Nova Solutions", eventName: "Vietnam Innovation Summit", phone: "0903456789", email: "anh@nova.vn", website: "nova.vn", note: "", personalUrl: "", userConfirmed: true },
      "",
      { name: "TRAN MINH ANH", role: "Giam doc", company: "NOVA SOLUTIONS", phone: "0903456789", email: "anh@nova.vn", website: "nova.vn", rawText: "TRAN MINH ANH\\nNOVA SOLUTIONS", confidence: 92, language: "vie+eng" }
    );
    const card = data.cards[0];
    return { rawOcr: card.rawOcr, confidence: card.ocrConfidence, reviewConfidence: card.reviewConfidence, reviewStatus: card.reviewStatus, language: card.ocrLanguage, correctionFields: card.corrections.map(item => item.field) };
  })()`, sandbox);
  assert.match(result.rawOcr, /NOVA SOLUTIONS/);
  assert.equal(result.confidence, 92);
  assert.equal(result.reviewConfidence, 100);
  assert.equal(result.reviewStatus, "USER_CONFIRMED");
  assert.equal(result.language, "vie+eng");
  assert.ok(result.correctionFields.includes("name"));
  assert.ok(result.correctionFields.includes("role"));
});

test("form cho phép lưu chưa xác nhận khi phone và email trống", () => {
  const { sandbox } = createAppSandbox();
  const valid = vm.runInContext(`validateScanFields({ name: "Nguyễn An", phone: "", email: "", website: "", userConfirmed: false })`, sandbox);
  assert.equal(valid, true);
});

test("persistScan giữ đúng trạng thái review và confirmation của methods", () => {
  const { sandbox } = createAppSandbox();
  vm.runInContext(`closeModal = () => {}; setRoute = () => {}; toast = () => {};`, sandbox);
  const result = vm.runInContext(`(() => {
    persistScan(
      { front: "data:image/png;base64,AA==", back: "", backBlank: true },
      { name: "Nguyễn An", role: "", company: "", eventName: "Gặp tại văn phòng", phone: "0901234567", email: "", website: "", note: "", personalUrl: "", userConfirmed: false }
    );
    const card = data.cards[0];
    const contact = data.contacts[0];
    return { reviewStatus: card.reviewStatus, reviewConfidence: card.reviewConfidence, draft: contact.draft, methodConfirmed: contact.methods[0].confirmed };
  })()`, sandbox);
  assert.deepEqual({ ...result }, { reviewStatus: "UNCONFIRMED", reviewConfidence: 0, draft: true, methodConfirmed: false });
});

test("relinkCard chuyển đúng snapshot mà không trộn dữ liệu contact", () => {
  const { sandbox } = createAppSandbox();
  vm.runInContext(`closeModal = () => {}; setRoute = () => {}; toast = () => {};`, sandbox);
  const result = vm.runInContext(`(() => {
    const card = data.cards.find(item => item.id === "card_1");
    const oldContact = data.contacts.find(item => item.id === "ct_anh");
    const target = data.contacts.find(item => item.id === "ct_khoa");
    const targetName = target.name;
    relinkCard(card.id, target.id);
    return { contactId: card.contactId, previousContactId: card.previousContactId, oldHas: oldContact.cards.includes(card.id), targetHas: target.cards.includes(card.id), targetName, afterName: target.name };
  })()`, sandbox);
  assert.equal(result.contactId, "ct_khoa");
  assert.equal(result.previousContactId, "ct_anh");
  assert.equal(result.oldHas, false);
  assert.equal(result.targetHas, true);
  assert.equal(result.afterName, result.targetName);
});

test("deleteCard xóa payload PII nhưng giữ trạng thái acceptance", () => {
  const { sandbox } = createAppSandbox();
  vm.runInContext(`closeModal = () => {}; render = () => {}; toast = () => {};`, sandbox);
  const result = vm.runInContext(`(() => {
    const card = data.cards.find(item => item.id === "card_1");
    card.front = "data:image/png;base64,AA==";
    card.rawOcr = "PRIVATE";
    card.corrections = [{ field: "name" }];
    deleteCard(card.id);
    return { lifecycle: card.lifecycle, acceptance: card.acceptance, front: card.front, rawOcr: card.rawOcr, corrections: card.corrections.length, purged: card.purgedEvidenceSummary };
  })()`, sandbox);
  assert.equal(result.lifecycle, "DELETED");
  assert.equal(result.acceptance, "LOCAL_ACCEPTED");
  assert.equal(result.front, "");
  assert.equal(result.rawOcr, "");
  assert.equal(result.corrections, 0);
  assert.equal(result.purged.hadFront, true);
});

test("proposal stale được supersede và không ghi đè target mới", () => {
  const { sandbox } = createAppSandbox();
  vm.runInContext(`render = () => {}; toast = () => {};`, sandbox);
  const result = vm.runInContext(`(() => {
    const contact = data.contacts.find(item => item.id === "ct_anh");
    const method = contact.methods[0];
    data.proposals.unshift({ id: "prop_stale", contactId: contact.id, kind: "UPDATE", target: "PHONE", targetId: method.id, currentValue: method.value, value: "0900000000", source: "Card #TEST", status: "PENDING", targetVersion: contact.version });
    method.value = "0911111111";
    resolveProposal("prop_stale", true);
    return { value: method.value, status: data.proposals[0].status, reason: data.proposals[0].reason };
  })()`, sandbox);
  assert.equal(result.value, "0911111111");
  assert.equal(result.status, "SUPERSEDED");
  assert.match(result.reason, /Target/);
});

test("confirmCardReview hoàn tất luồng kiểm tra sau và xác nhận method cùng nguồn", () => {
  const { sandbox } = createAppSandbox();
  vm.runInContext(`closeModal = () => {}; setRoute = () => {}; toast = () => {};`, sandbox);
  const result = vm.runInContext(`(() => {
    persistScan(
      { front: "data:image/png;base64,AA==", back: "", backBlank: true },
      { name: "Nguyễn Review", role: "", company: "", eventName: "Gặp tại văn phòng", phone: "0901234567", email: "", website: "", note: "", personalUrl: "", userConfirmed: false }
    );
    const card = data.cards[0];
    const contact = data.contacts[0];
    confirmCardReview(card.id);
    return { reviewStatus: card.reviewStatus, confidence: card.reviewConfidence, draft: contact.draft, tags: contact.tags, methodConfirmed: contact.methods[0].confirmed };
  })()`, sandbox);
  assert.equal(result.reviewStatus, "USER_CONFIRMED");
  assert.equal(result.confidence, 100);
  assert.equal(result.draft, false);
  assert.equal(result.tags.includes("Chưa xác nhận"), false);
  assert.equal(result.methodConfirmed, true);
});

test("search và copy không dùng method hoặc relationship đã REVOKED", () => {
  const { sandbox } = createAppSandbox();
  const result = vm.runInContext(`(() => {
    const contact = data.contacts.find(item => item.id === "ct_anh");
    contact.methods.push({ kind: "EMAIL", label: "Cũ", value: "revoked-only@example.com", status: "REVOKED" });
    contact.relationships.push({ company: "Revoked Only Corp", role: "Old", status: "REVOKED" });
    let copied = "";
    copyText = value => { copied = value; };
    copyProfile(contact.id);
    const searchable = searchableContactText(contact);
    return { searchable, copied };
  })()`, sandbox);
  assert.equal(result.searchable.includes("revoked-only"), false);
  assert.equal(result.searchable.includes("revoked only corp"), false);
  assert.equal(result.copied.includes("revoked-only"), false);
});

test("relinkCard chuyển encounter theo card và cập nhật contact cũ", () => {
  const { sandbox } = createAppSandbox();
  vm.runInContext(`closeModal = () => {}; setRoute = () => {}; toast = () => {};`, sandbox);
  const result = vm.runInContext(`(() => {
    const card = data.cards.find(item => item.id === "card_1");
    const oldContact = data.contacts.find(item => item.id === "ct_anh");
    const target = data.contacts.find(item => item.id === "ct_khoa");
    relinkCard(card.id, target.id);
    return {
      oldHasEncounter: oldContact.encounters.some(item => item.cardId === card.id),
      targetHasEncounter: target.encounters.some(item => item.cardId === card.id && item.event === card.event),
      targetEvent: target.event,
      oldEvent: oldContact.event
    };
  })()`, sandbox);
  assert.equal(result.oldHasEncounter, false);
  assert.equal(result.targetHasEncounter, true);
  assert.equal(result.targetEvent, "Vietnam Innovation Summit");
  assert.notEqual(result.oldEvent, "Vietnam Innovation Summit");
});
