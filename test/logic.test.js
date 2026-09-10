const test = require("node:test");
const assert = require("node:assert/strict");
const logic = require("../logic.js");

const contact = {
  id: "ct_1", name: "Trần Minh Anh", lifecycle: "ACTIVE", version: 3, personalUrl: "",
  methods: [
    { kind: "PHONE", value: "+84 903 456 789", status: "ACTIVE" },
    { kind: "EMAIL", value: "anh.tran@nova.vn", status: "ACTIVE" }
  ],
  relationships: [{ id: "rel_1", company: "Nova Solutions", role: "Giám đốc Phát triển", website: "nova.vn", status: "ACTIVE" }]
};

test("chuẩn hóa dữ liệu Việt Nam để dò trùng", () => {
  assert.equal(logic.normalizeName("  Trần Minh Ánh "), "tran minh anh");
  assert.equal(logic.normalizePhone("+84 903 456 789"), "0903456789");
  assert.equal(logic.normalizeEmail(" Anh.Tran@Nova.VN "), "anh.tran@nova.vn");
});

test("ưu tiên kết quả trùng theo số điện thoại hoặc email", () => {
  const result = logic.findDuplicateCandidates([contact], { name: "Người khác", phone: "0903 456 789", email: "" });
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].reasons, ["cùng số điện thoại"]);
});

test("tạo đề xuất PENDING mà không ghi đè hồ sơ", () => {
  let index = 0;
  const proposals = logic.buildAttachProposals(contact, {
    phone: "0909 111 222", email: "new@nova.vn", company: "Nova Solutions", role: "CEO", website: "nova.vn"
  }, "Card #NC-1007", () => `p_${++index}`);
  assert.deepEqual(proposals.map(item => item.kind), ["ADD", "ADD", "UPDATE"]);
  assert.ok(proposals.every(item => item.status === "PENDING"));
  assert.ok(proposals.every(item => item.targetVersion === 3 && item.createdAt));
  assert.equal(contact.methods.length, 2);
  assert.equal(contact.relationships[0].role, "Giám đốc Phát triển");
});

test("tạo proposal UPDATE riêng cho tên và website cá nhân", () => {
  let index = 0;
  const existing = { ...contact, personalUrl: "https://old.example.com", methods: [...contact.methods], relationships: [...contact.relationships] };
  const proposals = logic.buildAttachProposals(existing, {
    name: "Trần Minh An", phone: "+84 903 456 789", email: "anh.tran@nova.vn", company: "Nova Solutions",
    role: "Giám đốc Phát triển", website: "nova.vn", personalUrl: "https://new.example.com"
  }, "Card #NC-NAME", () => `identity_${++index}`);
  const name = proposals.find(item => item.target === "NAME");
  const personal = proposals.find(item => item.target === "PERSONAL_URL");
  assert.equal(name.kind, "UPDATE");
  assert.equal(name.currentValue, "Trần Minh Anh");
  assert.equal(personal.kind, "UPDATE");
  assert.equal(personal.currentValue, "https://old.example.com");
  assert.equal(existing.name, "Trần Minh Anh");
});

test("sinh proposal REMOVE từ lựa chọn rõ ràng của người dùng", () => {
  let index = 0;
  const proposals = logic.buildAttachProposals(contact, {
    phone: "0903 456 789", email: "new@nova.vn", company: "Lumen Studio", role: "CEO", website: "lumen.vn",
    removeTargets: [{ target: "METHOD", targetId: "missing" }, { target: "RELATIONSHIP", targetId: "rel_1" }]
  }, "Card #NC-REMOVE", () => `remove_${++index}`);
  const removal = proposals.find(item => item.kind === "REMOVE");
  assert.equal(removal.target, "RELATIONSHIP");
  assert.equal(removal.targetId, "rel_1");
  assert.equal(removal.status, "PENDING");
  assert.equal(contact.relationships[0].status, "ACTIVE");
});

test("chặn email, điện thoại và URL không an toàn", () => {
  assert.equal(logic.isValidEmail("a@b.vn"), true);
  assert.equal(logic.isValidEmail("a@b"), false);
  assert.equal(logic.isValidPhone("+84 909 120 826"), true);
  assert.equal(logic.isValidPhone("123"), false);
  assert.equal(logic.safeWebsiteUrl("javascript:alert(1)"), "");
  assert.equal(logic.safeWebsiteUrl("example.com"), "https://example.com/");
});
