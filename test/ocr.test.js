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

test("ưu tiên tên người, chức danh và số mobile trên card AEON", () => {
  const parsed = ocr.parseBusinessCardText(`
AEON TOPVALU VIETNAM COMPANY LIMITED
NGUYEN MINH THUC
Food and HBC Division
General Manager lạ
10th Floor, Unit B1, Robot Tower
Tel: (84-28) 3832 8800
Tax Code: 0313756193
Mobile: 0938-638-881
Email: thuc.nguyen@aeontopvalu.com.vn
Planting Seeds of Growth
  `);
  assert.equal(parsed.name, "NGUYEN MINH THUC");
  assert.equal(parsed.role, "General Manager");
  assert.equal(parsed.company, "AEON TOPVALU VIETNAM COMPANY LIMITED");
  assert.equal(parsed.phone.replace(/\D/g, ""), "0938638881");
  assert.equal(parsed.email, "thuc.nguyen@aeontopvalu.com.vn");
  assert.equal(parsed.website, "aeontopvalu.com.vn");
});

test("tách đúng card All Made Viet và loại slogan khỏi họ tên", () => {
  const parsed = ocr.parseBusinessCardText([
    "All Made",
    "Connecting Buyers and Sellers Globally",
    "Liney Weishappel",
    "CEO Co Founder",
    "Phone/Zalo/WhatsApp +84 707849598",
    "Email hello@allmadeviet.com",
    "www.allmadeviet.com  www.allmadevietfood.com"
  ].join("\n"));
  assert.equal(parsed.name, "Liney Weishappel");
  assert.equal(parsed.role, "CEO Co Founder");
  assert.equal(parsed.company, "All Made Viet");
  assert.equal(parsed.phone.replace(/\D/g, ""), "84707849598");
  assert.equal(parsed.email, "hello@allmadeviet.com");
  assert.equal(parsed.website, "allmadeviet.com");
});
