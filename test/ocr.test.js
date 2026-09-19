const test = require("node:test");
const assert = require("node:assert/strict");
const ocr = require("../ocr.js");

test("tách dữ liệu namecard Việt/Anh từ raw OCR", () => {
  const parsed = ocr.parseBusinessCardText(`
TRẦN MINH ANH
Business Development Director
NOVA SOLUTIONS
+84 903 456 789
anh.tran@nova.vn
www.nova.vn
  `);
  assert.equal(parsed.name, "TRẦN MINH ANH");
  assert.equal(parsed.role, "Business Development Director");
  assert.equal(parsed.company, "NOVA SOLUTIONS");
  assert.equal(parsed.phone.replace(/\D/g, ""), "84903456789");
  assert.equal(parsed.email, "anh.tran@nova.vn");
  assert.equal(parsed.website, "nova.vn");
});

test("parser suy ra website công ty từ tên miền email", () => {
  const parsed = ocr.parseBusinessCardText("LÊ QUỐC KHOA\nInvestment Manager\nkhoa@horizoncapital.vn");
  assert.equal(parsed.email, "khoa@horizoncapital.vn");
  assert.equal(parsed.website, "horizoncapital.vn");
});

test("ưu tiên tên người, chức danh và số mobile trên card doanh nghiệp giả lập", () => {
  const parsed = ocr.parseBusinessCardText(`
EXAMPLE DYNAMICS VIETNAM COMPANY LIMITED
NGUYEN AN TEST
Product Division
General Manager
10 Example Street, HCMC, Vietnam
Tel: (84-28) 3000 0000
Tax Code: 0000000000
Mobile: 0900-000-001
Email: an.nguyen@example.test
Generated fixture for automated testing
  `);
  assert.equal(parsed.name, "NGUYEN AN TEST");
  assert.equal(parsed.role, "General Manager");
  assert.equal(parsed.company, "EXAMPLE DYNAMICS VIETNAM COMPANY LIMITED");
  assert.equal(parsed.phone.replace(/\D/g, ""), "0900000001");
  assert.equal(parsed.email, "an.nguyen@example.test");
  assert.equal(parsed.website, "example.test");
});

test("tách đúng card doanh nghiệp giả lập và loại slogan khỏi họ tên", () => {
  const parsed = ocr.parseBusinessCardText([
    "Example Made LLC",
    "Generated business fixture for testing",
    "Alex Tester",
    "CEO Co Founder",
    "Phone +84 900000002",
    "Email hello@example.test",
    "www.example.test  catalog.example.test"
  ].join("\n"));
  assert.equal(parsed.name, "Alex Tester");
  assert.equal(parsed.role, "CEO Co Founder");
  assert.equal(parsed.company, "Example Made LLC");
  assert.equal(parsed.phone.replace(/\D/g, ""), "84900000002");
  assert.equal(parsed.email, "hello@example.test");
  assert.equal(parsed.website, "example.test");
});
