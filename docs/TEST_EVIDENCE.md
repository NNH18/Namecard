# Hardening test evidence

- Timestamp: `2026-09-20T02:37:29+07:00`
- Baseline commit: `1b5b7830c31964966750d32f885fad16a90452bf`
- Candidate branch: `codex/staging-hardening`
- Environment: Windows, Node `v24.19.0`, npm `11.17.0`, Supabase CLI `2.117.0` through `npx`
- Data policy: generated fixtures only; historic real-card OCR evidence was removed

| Command | Result |
|---|---|
| `npm ci` | PASS; 115 packages audited, 0 vulnerabilities |
| `npm test` | PASS; 69/69 |
| `npm run check` | PASS |
| `npm run build` | PASS |
| `npm run test:ocr` | PASS; `vie+eng`, confidence fixture 94%, online/offline and CSP/worker/WASM checks |
| `npm run test:visual` | PASS; 320/390/1024, dark/responsive and core interaction smoke |
| `npm run mobile:sync` | PASS; TokenVault detected for Android and iOS, portable SwiftPM path normalized by script |
| `supabase db reset` | NOT RUN locally; Docker is unavailable on this workstation |
| `supabase test db` | NOT RUN locally; Docker is unavailable on this workstation |
| GitHub Actions web/database jobs | PENDING on candidate push |

CI uploads `server.log` and `test-results/` under an artifact named with `${{ github.sha }}`. That artifact is the commit-bound evidence for the pushed candidate; this document must be updated with its run URL and final status after CI completes.
