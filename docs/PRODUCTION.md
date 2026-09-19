# BCard production setup

## Ownership and data flow

The browser uses the public Supabase anon key only. Supabase Auth identifies the user; PostgreSQL RLS and private Storage policies enforce the account boundary. UI code writes through `lib/repository.js` to an owner-scoped IndexedDB snapshot, object cache, image store and pending queue. `lib/sync.js` sends operations in dependency order and the `sync_object` RPC validates the authenticated owner, idempotency key and expected version. A stale write becomes `CONFLICT`; it is never applied as last-write-wins.

Card images use `namecard-images/<auth.uid()>/<card-id>/<image-id>-<checksum>.<ext>`. The bucket is private. The local Blob is committed with the card before `LOCAL_ACCEPTED`; upload status and database ACK remain separate. Delete/restrict operations supersede pending uploads, remove private Storage content, retain a metadata tombstone and do not alter acceptance history.

Company Research receives only company name, official website/business domain and optional address. The browser never sends card images, notes, phone numbers or encounter history. Edge Functions validate the JWT, block unsafe URLs, enforce rate/size/time limits, coalesce concurrent jobs, cache by normalized domain, call the configured model with a strict JSON schema, validate the result, and store facts plus source mappings per owner.

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
supabase secrets set OPENAI_API_KEY=... COMPANY_RESEARCH_MODEL=gpt-5-mini RESEARCH_RATE_LIMIT_PER_HOUR=10 RESEARCH_CACHE_DAYS=30
supabase functions deploy company-resolver
supabase functions deploy company-research
```

For a local Supabase stack use `supabase start` and `supabase db reset`. A rollback must restore the database first, then deploy the previous web/Edge Function version. Migrations intentionally use soft delete/tombstones; do not reverse them by deleting tables on a live tenant. Back up and test restore before pilot.

## RLS verification

Create two isolated test users A and B. With each user's access token, insert one contact and upload one image beneath that user's UUID. Verify A can select/update/export/download A and receives no rows or a policy error for B; repeat in reverse. Verify a composite foreign key rejects linking A's method/card/relationship to B's contact. Run a stale `sync_object` request with `p_expected_version` below the current version and verify `STALE_VERSION`, then repeat the same successful idempotency key and verify one row/one ACK. The static security tests run with `npm test`; live RLS tests require a configured Supabase project and two test credentials.

## Deployment checklist

1. Apply migrations and deploy both Edge Functions.
2. Configure public build variables and Edge Function secrets separately.
3. Run `npm test`, `npm run check`, `npm run build`, `npm run test:ocr`, `npm run test:visual`, and `npm run mobile:sync`.
4. Verify sign-up/sign-in, two-account isolation, offline restart, retry/idempotency, stale conflict, private image upload/download/delete, export and research against the target project.
5. Review retention, privacy disclosure, threat model, backup/restore, incident ownership and store requirements before real-card pilot.

## Retention and limitations

Research cache TTL defaults to 30 days and is centrally configurable. Data requests are durable objects with audit records; operational handling and response deadlines still require the approved legal process. `purge_expired_research` is server-only and must be scheduled only after retention approval. Signed URLs are limited to 15 minutes and are never placed in exports or the service-worker cache.

External gates remain: legal/privacy and data-map approval, threat-model/security review, backup/restore exercise, Android/iOS device validation, incident/support ownership, and live Supabase/OpenAI end-to-end evidence.
