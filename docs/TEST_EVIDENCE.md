# Hardening test evidence

- Timestamp: `2026-09-20T02:37:29+07:00`
- Baseline commit: `1b5b7830c31964966750d32f885fad16a90452bf`
- Implementation commit: `9b4c7cdbcee6e2dde1fc0cd5f453a41149fefa5c`
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
| GitHub Actions web job | PASS in 37s; unit/check/build/OCR/visual and artifact upload |
| GitHub Actions database job | PASS in 1m46s; local stack start, migration reset and pgTAP suite |

Commit-bound CI evidence: [GitHub Actions run 35465156660](https://github.com/NNH18/Namecard/actions/runs/35465156660). CI uploads `server.log` and `test-results/` under an artifact named with the tested commit SHA.
