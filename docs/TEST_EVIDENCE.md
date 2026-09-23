# Hardening test evidence

- Recorded: `2026-09-23T14:30:00+07:00`
- Tested `main` commit: `13dd2a2fb60767e78151df0a811c17453c9b055d`
- Merged change: [PR #3](https://github.com/NNH18/Namecard/pull/3)
- Commit-bound workflow: [GitHub Actions run 35831844650](https://github.com/NNH18/Namecard/actions/runs/35831844650)
- CI environment: GitHub-hosted Ubuntu runner, Node `24.19.0`, Deno `2.9.7`, Supabase CLI `2.117.0`
- Local verification environment: Windows, Node `v24.19.0`, npm `11.17.0`
- Data policy: generated fixtures only; no real-card PII is committed or used by CI

| Check | Result |
|---|---|
| `npm ci` | PASS; 115 packages audited, 0 vulnerabilities |
| `npm test` | PASS; 78/78 |
| `npm run check` | PASS |
| Edge Function `deno check` | PASS; resolver and research functions |
| `npm run build` | PASS |
| `npm run test:ocr` | PASS; `vie+eng`, offline assets, worker/WASM and CSP checks |
| `npm run test:visual` | PASS; 320/390/1024 px, dark/responsive and workflow smoke |
| `npm run mobile:sync` | PASS locally; Android/iOS web assets synchronized |
| `supabase db reset` | PASS in GitHub Actions database job |
| `supabase test db` | PASS in GitHub Actions database job; 19 pgTAP assertions |
| GitHub Actions `web` | PASS in 58s |
| GitHub Actions `database` | PASS in 1m46s |

The workflow artifact is named with the tested commit SHA and contains `server.log` plus `test-results/`. This documentation update does not modify runtime or database code; the linked run is the authoritative result for the merge commit above.
