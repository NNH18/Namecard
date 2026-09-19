const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("migrations enforce RLS, owner composite foreign keys and private storage", () => {
  const sql = read("supabase/migrations/202609200001_bcard_core.sql");
  for (const table of ["contacts", "contact_methods", "cards", "card_images", "notes", "company_research", "audit_log"]) assert.match(sql, new RegExp(`alter table public\\.%I enable row level security|${table}`, "i"));
  assert.match(sql, /force row level security/i);
  assert.match(sql, /foreign key\(owner_id,contact_id\)/i);
  assert.match(sql, /'namecard-images','namecard-images',false/i);
  assert.match(sql, /storage\.foldername\(name\).*auth\.uid/i);
  assert.match(read("supabase/tests/database/rls_isolation.test.sql"), /owner B cannot read owner A contact/);
});

test("service worker never caches private API, auth or storage responses", () => {
  const source = read("sw.js");
  assert.match(source, /request\.headers\.has\("authorization"\)/);
  assert.match(source, /auth\|rest\|storage/);
  assert.match(source, /functions/);
  assert.match(source, /cache: "no-store"/);
});

test("browser bundle source does not contain committed server secrets", () => {
  const files = ["config.public.js", ...fs.readdirSync(path.join(root, "lib")).map(name => `lib/${name}`)];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /sk-[A-Za-z0-9_-]{20,}/, file);
    assert.doesNotMatch(source, /service_role\.[A-Za-z0-9_-]{20,}/, file);
  }
});
