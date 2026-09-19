# Controlled DSR operator runbook

This workflow is for verified data-subject requests that may span more than one BCard tenant. It runs only from a trusted server or restricted operator console using the Supabase service role. Never place the service-role key in the browser, mobile build, logs, tickets or repository.

1. Create a `privacy_cases` row with an opaque `request_reference`, request type, narrow scope, retention deadline and the authenticated creator. Store only approved SHA-256 hashes of normalized email/phone criteria in `criteria_hashes`; keep identity evidence in the approved case system outside BCard.
2. A different authorized reviewer completes identity verification and sets `verification_status=VERIFIED`, `verified_by` and the review timestamp. Reject or expire insufficient requests. Candidate lookup is forbidden while verification is pending.
3. Confirm the actor has a current `PRIVACY_COMPLIANCE` entry in `operator_roles`. Call `locate_privacy_case_candidates(case_id, actor_id, reason)` from the trusted service. The reason must be case-specific. The RPC records the actor, scope, reason, time and candidate count in `operator_audit_log`.
4. Review each `privacy_case_matches` candidate manually. A hash match is a candidate, not proof of identity. Set `review_status` and reviewer metadata. Do not disclose tenant identity or raw tenant data to the requester before legal review permits it.
5. Record every approved action in `privacy_case_actions`, including target match, actor, reason, result and minimal metadata. Apply tenant-side access, correction, restriction or deletion through an approved server workflow that preserves lifecycle, idempotency and audit rules.
6. Record the response status, close the case only after action reconciliation, and enforce `retention_until`. Security or legal exceptions must be documented in the case audit trail.

Ordinary authenticated users and tenant support roles have no table grants and cannot execute the locator. `SUPPORT` is not a privacy operator. Cross-tenant access must remain case-scoped; raw global PostgREST or Storage browsing is prohibited.

Before controlled staging, rehearse a verified and an unverified fake case. Confirm the unverified lookup is rejected, an ordinary user cannot execute the RPC, candidates require manual review, all actions have actor/reason/scope/time, and no response leaks another tenant's identity.
