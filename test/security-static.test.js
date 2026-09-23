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

test("hardening migration separates operator roles and blocks direct private DML", () => {
  const sql = read("supabase/migrations/202609200005_staging_hardening.sql");
  assert.match(sql, /operator_roles[\s\S]*PRIVACY_COMPLIANCE/);
  assert.match(sql, /locate_privacy_case_candidates[\s\S]*VERIFIED_CASE_REQUIRED/);
  assert.match(sql, /revoke insert,update,delete on table public\.%I from anon,authenticated/i);
  assert.match(sql, /grant execute on function public\.sync_object[\s\S]*to authenticated/i);
  assert.match(sql, /AUDITOR'[\s\S]*delete from public\.account_roles|delete from public\.account_roles where role = 'AUDITOR'/i);
  assert.match(read("supabase/migrations/202609200001_bcard_core.sql"), /namecard_images_select[\s\S]*auth\.uid/i);
});

test("server lifecycle and conflict protocol never insert a missing DELETE row", () => {
  const sql = read("supabase/migrations/202609200005_staging_hardening.sql");
  assert.match(sql, /if v_current=0 then[\s\S]*'status','ABSENT'/i);
  assert.match(sql, /SYNC_CONFLICT/);
  assert.doesNotMatch(sql, /raise exception[^;]*STALE_VERSION/i);
  assert.match(sql, /reconcile_sync_operation/);
});

test("server normalization, stable provenance and atomic research quota are present", () => {
  const sql = read("supabase/migrations/202609200005_staging_hardening.sql");
  assert.match(sql, /normalize_contact_method/);
  assert.match(sql, /contact_method_active_normalized/);
  assert.match(sql, /source_object_id/); assert.match(sql, /target_value_id/);
  assert.match(sql, /consume_research_quota[\s\S]*on conflict\(owner_id,bucket\) do update/i);
  assert.match(sql, /pg_advisory_xact_lock[\s\S]*hashtextextended/i);
});

test("Company Research is bound to the existing TenantCompany and filters personal contacts", () => {
  const research = read("supabase/functions/company-research/index.ts");
  const resolver = read("supabase/functions/company-resolver/index.ts");
  const shared = read("supabase/functions/_shared/security.ts");
  assert.match(research, /TENANT_COMPANY_REQUIRED/); assert.match(research, /TENANT_COMPANY_NOT_FOUND/);
  assert.doesNotMatch(research, /tenant_companies"\)\.upsert/);
  assert.match(research, /public_company_contacts/); assert.match(shared, /PERSONAL_CONTACT_REJECTED/);
  assert.match(research, /consume_research_quota/);
  assert.match(research, /CONFIRMED_CARD_REQUIRED/); assert.match(resolver, /CONFIRMED_CARD_REQUIRED/);
  assert.match(research, /company_resolution[\s\S]*SERVER_VERIFIED[\s\S]*USER_CONFIRMED/);
  assert.doesNotMatch(research, /body\?\.candidate/);
});

test("research migration binds cache to identity versions and stores bounded fact evidence", () => {
  const sql = read("supabase/migrations/202609230001_research_identity_evidence.sql");
  assert.match(sql, /SERVER_VERIFIED/); assert.match(sql, /USER_CONFIRMED/); assert.match(sql, /CANDIDATE/);
  assert.match(sql, /identity_version/); assert.match(sql, /status='STALE'/);
  assert.match(sql, /create table public\.research_fact_evidence/);
  assert.match(sql, /length\(excerpt\) between 8 and 500/);
  assert.match(sql, /revoke insert,update,delete on table public\.research_fact_evidence from anon,authenticated/);
});

test("CI runs current web and database suites without production credentials", () => {
  const workflow = read(".github/workflows/ci.yml");
  for (const command of ["npm ci", "npm test", "npm run check", "npm run build", "npm run test:visual", "supabase db reset", "supabase test db"]) assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
  assert.doesNotMatch(workflow, /version:\s+latest/);
  assert.match(workflow, /node-version:\s+24\.19\.0/);
  assert.match(workflow, /version:\s+2\.117\.0/);
});

test("GitHub Pages publishes the generated web bundle with pinned actions", () => {
  const workflow = read(".github/workflows/pages.yml");
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /path:\s+www/);
  assert.match(workflow, /pages:\s+write/);
  assert.match(workflow, /id-token:\s+write/);
  assert.doesNotMatch(workflow, /uses:\s+[^\s]+@v\d+/);
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
