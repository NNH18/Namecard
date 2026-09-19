# Engineering decisions for staging hardening

## ED-01 — Session persistence

Native Capacitor builds use `capacitor-token-vault@0.1.1` (MIT, Capacitor 8) for iOS Keychain and Android Keystore-backed refresh-token storage. Access tokens remain in memory. Native startup fails closed if the plugin is unavailable; it never falls back to IndexedDB, localStorage, or plaintext Preferences. Browser/PWA sessions are memory-only until a separate browser persistence review approves a longer-lived mechanism.

## ED-02 — Remote visibility and lifecycle supersession

Queued objects use `NEVER_DISPATCHED`, `MAY_HAVE_REACHED_SERVER`, and `ACKED` evidence. A local lifecycle mutation, superseding older operations, PII payload minimization, and local image-blob purge share one IndexedDB transaction. A missing remote row produces `ABSENT` without inserting a tombstone row. Unknown ACK state is reconciled by idempotency metadata before any resend.

## ED-03 — Storage authorization

The controlled staging scope remains owner-only for card images. Database delegation does not imply image delegation. Storage paths must start with `auth.uid()`, signed URLs are capped at 15 minutes, and operator roles receive no direct Storage browse permission.

## ED-04 — Privacy operator workflow

Tenant membership (`OWNER`, `ADMIN`, `MEMBER`) is separate from operator duties (`SUPPORT`, `PRIVACY_COMPLIANCE`, `SECURITY`). Cross-tenant DSR lookup is service-side, requires a verified case, approved hashed criteria, an active privacy operator, a reason, manual candidate review, and an operator audit record. It does not create a global identity graph.

## ED-05 — Company Research identity and quotas

Research requires the existing `tenant_company_id`; Edge Functions verify it belongs to the authenticated owner and never create a domain-derived alternate company. Resolver and research provider calls have separate atomic quota buckets. Company contacts use a structured allowlist and deterministic rejection of named-person mailboxes, mobiles, and labels.

## ED-06 — Migration compatibility

Hardening is delivered as forward migration `202609200005_staging_hardening.sql`. Existing migrations remain immutable. Active normalized ContactMethod duplicates are retained as `RESTRICTED` rows before the normalized unique index is created, so no row is deleted during upgrade.
