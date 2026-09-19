# Hardening baseline

- Timestamp: 2026-09-20T01:50:13+07:00
- Baseline commit: `1b5b7830c31964966750d32f885fad16a90452bf`
- Branch used for hardening: `codex/staging-hardening` from `upstream/main`
- Node: `v24.19.0`
- npm: `11.17.0`
- Supabase CLI: not installed on `PATH` at baseline; `npx supabase@2.117.0` is available later in the run
- Docker: unavailable on this workstation, so the local Supabase stack and pgTAP suite cannot run here

| Command | Baseline result |
|---|---|
| `npm ci` | PASS; 114 packages audited, 0 vulnerabilities |
| `npm test` | PASS; 48/48 |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `npm run test:ocr` | PASS; vie+eng runtime and offline cache |
| `npm run test:visual` | PASS; 320/390/1024 and interaction smoke |
| `npm run mobile:sync` | PASS; Android/iOS assets synced |
| `supabase start` / `supabase db reset` / `supabase test db` | NOT RUN; Docker is unavailable |

This file records the pre-change baseline only. It is not evidence for the hardened implementation or for a deployed staging environment.
