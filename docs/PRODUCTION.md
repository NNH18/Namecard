# BCard production setup

## Ownership and data flow

The browser uses the public Supabase anon key only. Supabase Auth identifies the user; PostgreSQL RLS and private Storage policies enforce the account boundary. UI code writes through `lib/repository.js` to an owner-scoped IndexedDB snapshot, object cache, image store and pending queue. `lib/sync.js` sends operations in dependency order and the `sync_object` RPC validates the authenticated owner, idempotency key and expected version. Authenticated clients have read access where required but cannot use direct table DML to bypass the RPC. A stale write returns a durable `CONFLICT` response and leaves both the object and conflict audit evidence intact.

Card images use `namecard-images/<auth.uid()>/<card-id>/<image-id>-<checksum>.<ext>`. The bucket is private and owner-only in this staging scope. The local Blob is committed with the card before `LOCAL_ACCEPTED`; upload status and database ACK remain separate. Queue records distinguish never dispatched, possibly received, and acknowledged content. A delete atomically supersedes older content, minimizes queued payloads and purges local blobs. Never-dispatched objects create no server row; possibly received objects reconcile by idempotency metadata and then propagate deletion.

Company Research receives an existing tenant company ID plus a confirmed contact ID. Full personal email mailboxes, card images, notes, phone numbers and encounter history are excluded. Both Edge Functions require an active, non-draft contact, an active relationship to that TenantCompany and an active `USER_CONFIRMED` card. OCR websites and business-email domains remain `CANDIDATE`; the resolver fetches the candidate site and requires company-name identity evidence before `SERVER_VERIFIED`, or records a separate explicit `USER_CONFIRMED` decision. Research then loads the canonical resolution/version on the server instead of trusting a client candidate.

Research cache keys include `tenant_company_id`, identity version and resolved domain. An identity change marks prior completed research `STALE`. Each accepted fact has a bounded excerpt, retrieval time and source tied to the exact fetched URL; unsupported facts are dropped. Generic company email/hotline values must occur in that fetched content, and unrelated source URLs are rejected. The UI reports verification/evidence coverage and never presents model self-confidence as a measured probability.

## Session storage policy

Capacitor native builds use `capacitor-token-vault@0.1.1`: refresh tokens are stored in iOS Keychain or Android Keystore-backed storage, while access tokens remain in memory. Native startup fails with `NATIVE_SECURE_STORAGE_REQUIRED` when the plugin is missing; there is no plaintext fallback. Browser/PWA sessions are memory-only and require sign-in after a page lifecycle ends. IndexedDB stores account data and pending operations but no refresh token. Logout and account switch clear the secure slot before the old account can be restored.

## Local web

```powershell
Copy-Item .env.example .env.local
$env:SUPABASE_URL='https://PROJECT.supabase.co'
$env:SUPABASE_ANON_KEY='PUBLIC_ANON_KEY'
npm ci
npm run build
npm start
```

Without both public variables BCard runs in explicit local-development mode: IndexedDB and offline UI work, while server sync/research report configuration required and never report fake success. `build.js` generates `www/config.public.js`; do not edit `www` by hand.

## Supabase

Install the Supabase CLI, link a test project, then apply migrations in order:

```powershell
supabase link --project-ref PROJECT_REF
supabase db push
supabase secrets set OPENAI_API_KEY=... COMPANY_RESEARCH_MODEL=gpt-5-mini RESEARCH_RATE_LIMIT_PER_HOUR=10 RESOLVER_RATE_LIMIT_PER_HOUR=10 RESEARCH_CACHE_DAYS=30
supabase functions deploy company-resolver
supabase functions deploy company-research
```

For a local Supabase stack use `supabase start` and `supabase db reset`. A rollback must restore the database first, then deploy the previous web/Edge Function version. Migrations intentionally use soft delete/tombstones; do not reverse them by deleting tables on a live tenant. Back up and test restore before pilot.

## RLS verification

Use `supabase db reset && supabase test db` to create isolated fake users A and B. The pgTAP suite proves owner reads, cross-owner denial, Storage metadata isolation, direct DML denial, approved RPC writes, composite-owner foreign keys, durable conflict evidence, delete-absent behavior and server normalization. A stale `sync_object` call returns `{status:"CONFLICT"}` instead of raising a transaction-aborting exception. No production credential is required for this local suite.

## Controlled DSR workflow

The account-facing `data_requests` object records a signed-in user's request. A separate service-side workflow handles non-user data subjects through `privacy_cases`, `privacy_case_matches`, `privacy_case_actions`, `operator_roles` and `operator_audit_log`. Candidate lookup requires `VERIFIED` identity status, approved hashed email/phone criteria, an active `PRIVACY_COMPLIANCE` operator and a case-scoped reason. Candidates require manual review and are not disclosed directly to ordinary users or support roles. Follow [DSR_OPERATOR_RUNBOOK.md](DSR_OPERATOR_RUNBOOK.md); retention and response decisions remain subject to the external legal gate.

## Deployment checklist

1. Apply migrations and deploy both Edge Functions.
2. Configure public build variables and Edge Function secrets separately.
3. Run `npm test`, `npm run check`, `npm run build`, `npm run test:ocr`, `npm run test:visual`, and `npm run mobile:sync`. CI also runs `deno check` for both Edge Functions and the local Supabase migration/pgTAP suite.
4. Verify sign-up/sign-in, native secure-token restore, two-account isolation, offline restart, delete-before-sync, retry/idempotency, stale conflict, private image upload/download/delete, export, DSR operator workflow and research against the target project using fake data.
5. Review retention, privacy disclosure, threat model, backup/restore, incident ownership and store requirements before real-card pilot.

## Retention and limitations

Research cache TTL defaults to 30 days and is centrally configurable. Provenance retains stable source/target IDs and hashes rather than historical raw values; its final retention period remains configurable pending legal approval. DSR cases have explicit retention deadlines. `purge_expired_research` is server-only and must be scheduled only after retention approval. Signed URLs are limited to 15 minutes and are never placed in exports or the service-worker cache.

Passing engineering tests means the repository is ready for controlled staging validation with fake data. External gates remain: legal/privacy and data-map approval, threat-model/security review, backup/restore exercise, Android/iOS device validation, incident/support ownership, and live Supabase/OpenAI end-to-end evidence. It is not evidence of production readiness, store approval, compliance, or readiness for real-card pilot data.
