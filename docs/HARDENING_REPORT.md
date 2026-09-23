# BCard staging hardening report

Status: **Engineering hardening completed. Ready for controlled staging validation with fake data.** GitHub Actions verified both web and Supabase database jobs. This is not production, compliance, store or real-card-pilot approval.

## Research correctness follow-up

The current follow-up removes heuristic domain acceptance from the identity boundary. Draft/unconfirmed contacts are blocked on both client and server; resolver states are `UNRESOLVED`, `CANDIDATE`, `USER_CONFIRMED` and `SERVER_VERIFIED`; research loads the stored server resolution/version and rejects stale identities. Every accepted claim and public company contact requires its own bounded excerpt from the exact fetched source. Research metadata, claims, sources and evidence commit atomically before the cache becomes `COMPLETED`. The user interface shows evidence coverage, derivation type and verification state instead of an uncalibrated probability. Final commit-bound evidence is recorded in `docs/TEST_EVIDENCE.md` after CI completes for the merged main SHA.

## Files changed

| Area | Main paths | Reason |
|---|---|---|
| Local durability and sync | `lib/local-db.js`, `lib/repository.js`, `lib/sync.js`, `lib/production.js`, `app.js` | Atomic lifecycle supersession, PII minimization, remote-visibility evidence, reconciliation, conflict/backlog handling and separated delete propagation UI |
| Session security | `lib/session-store.js`, `lib/auth.js`, `capacitor.config.json`, native Capacitor plugin registration, `package*.json` | Memory-only browser sessions and Keychain/Keystore-backed native refresh-token storage with fail-closed behavior |
| Research | `lib/company-research.js`, `supabase/functions/company-*`, `supabase/functions/_shared/security.ts` | Existing TenantCompany identity, minimized inputs, public-company-contact validation, atomic quotas and automatic post-sync trigger |
| Atomic claim evidence | `supabase/functions/_shared/research-contract.mjs`, `202609230002_atomic_research_claims.sql` | One evidence binding per claim and transaction-safe research bundle replacement |
| Database security | `supabase/migrations/202609200005_staging_hardening.sql` | Forward-only RLS/privilege, normalization, provenance, DSR, quota, lifecycle and conflict hardening |
| Verification | `test/*.test.js`, `supabase/tests/database/rls_isolation.test.sql`, `.github/workflows/ci.yml` | Regression, privacy/security acceptance tests and reproducible web/database CI |
| Operations/docs | `docs/*`, `README.md`, `TONG_QUAN_PROJECT_VA_PRODUCTION.md`, `.gitignore` | Current staging boundary, operator workflow, evidence and canonical-source guidance |
| Hygiene/build | removed duplicate ZIP/source/demo/evidence snapshots; generated `www` and Capacitor registration refreshed | Remove obsolete duplicate trees and PII-bearing historic evidence while keeping canonical runtime assets |

## Database migration

`202609200005_staging_hardening.sql` upgrades an existing schema without changing prior migrations. It restricts tenant roles, revokes direct private-table DML, adds server-normalized ContactMethod identity, migrates active duplicates to `RESTRICTED`, adds stable provenance columns, creates controlled DSR tables/RPC, separates atomic resolver/research quotas, serializes object sync, returns durable conflicts and makes absent DELETE/RESTRICT a no-op. Rollback requires database restore plus the previous web/Edge Function release; dropping these controls in-place is not a safe live rollback.

## Bugs fixed

- **FIX-01:** delete-before-first-sync atomically supersedes older content/image operations, minimizes queued PII and purges local blobs; dispatch checks current object state again.
- **FIX-02:** native refresh tokens use `capacitor-token-vault@0.1.1`; browser sessions are memory-only; native has no plaintext fallback.
- **FIX-03:** verified, case-scoped DSR lookup exists for privacy operators with hashed criteria, manual review, actions, retention and audit.
- **FIX-04:** name, personal URL, contact method and company relationship lineage use stable source/target IDs and restore after pull.
- **FIX-05:** tenant and operator roles are separate; direct DML is blocked; approved RPC, composite-owner FK, private Storage and security-definer boundaries are tested.
- **FIX-06:** Company Research rejects named-person email/mobile and accepts only validated generic company channels with sources.
- **FIX-07:** resolver/research verify and retain the existing TenantCompany ID; no domain-derived duplicate is created.
- **FIX-08:** ContactMethod normalization and active uniqueness are authoritative on the server for email and Vietnam phone formats.
- **FIX-09:** stale writes return and persist `CONFLICT`; object data remains unchanged and the client keeps a resolvable conflict state.
- **FIX-10:** current test suites run in CI; stale/PII-bearing evidence and duplicate packaged source trees were removed; documentation now reflects the implemented staging code.
- **FIX-11:** unsupported sibling claims can no longer share one field-level excerpt; every accepted claim has its own evidence and derivation type.
- **FIX-12:** research rows can no longer remain `COMPLETED` after partial child writes; the full bundle commits or rolls back as one transaction.

## External gates

Live Supabase/OpenAI deployment and generated-data E2E validation are complete. Legal/Store Gate, Android/iOS device security tests, backup/restore exercise, threat-model review, retention approval and incident/support ownership remain required before processing real-card pilot data.

## Final self-audit

| Control | Result |
|---|---|
| Offline delete can upload older PII; older UPSERT can run; absent DELETE can create PII row | NO / NO / NO |
| Native refresh token remains in IndexedDB/plaintext | NO |
| Controlled non-user DSR workflow exists; ordinary user/support has cross-tenant lookup | YES / NO |
| Provenance uses stable IDs and restores after pull | YES / YES |
| Tenant AUDITOR/support has broad raw PII; authenticated REST bypasses sync | NO / NO |
| Research can create a duplicate TenantCompany or accept named-person contact by default | NO / NO |
| Research quota and server normalized uniqueness are atomic/authoritative | YES / YES |
| Durable conflict evidence, current CI and commit-bound evidence exist | YES / YES / YES |
| Repository contains detected server secrets or supplied real-card PII | NO |
| Repository claims production/compliance/store/real-card-pilot readiness | NO |

