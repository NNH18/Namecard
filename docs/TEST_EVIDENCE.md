# Hardening test evidence

- Recorded: `2026-09-23T14:30:00+07:00`
- Tested `main` commit: `06ae9add15f4b79792f09efcdfd59335e9613a0b`
- Merged changes: [research hardening PR #3](https://github.com/NNH18/Namecard/pull/3), [Pages deployment PR #8](https://github.com/NNH18/Namecard/pull/8)
- Commit-bound CI: [GitHub Actions run 35833307353](https://github.com/NNH18/Namecard/actions/runs/35833307353)
- Commit-bound staging deployment: [GitHub Pages run 35833540520](https://github.com/NNH18/Namecard/actions/runs/35833540520)
- CI environment: GitHub-hosted Ubuntu runner, Node `24.19.0`, Deno `2.9.7`, Supabase CLI `2.117.0`
- Local verification environment: Windows, Node `v24.19.0`, npm `11.17.0`
- Data policy: generated fixtures only; no real-card PII is committed or used by CI

| Check | Result |
|---|---|
| `npm ci` | PASS; 115 packages audited, 0 vulnerabilities |
| `npm test` | PASS; 79/79 |
| `npm run check` | PASS |
| Edge Function `deno check` | PASS; resolver and research functions |
| `npm run build` | PASS |
| `npm run test:ocr` | PASS; `vie+eng`, offline assets, worker/WASM and CSP checks |
| `npm run test:visual` | PASS; 320/390/1024 px, dark/responsive and workflow smoke |
| `npm run mobile:sync` | PASS locally; Android/iOS web assets synchronized |
| `supabase db reset` | PASS in GitHub Actions database job |
| `supabase test db` | PASS in GitHub Actions database job; 19 pgTAP assertions |
| GitHub Actions `web` | PASS in 55s |
| GitHub Actions `database` | PASS in 1m41s |
| GitHub Pages deployment | PASS in 24s; generated `www/` artifact, HTTPS |

The CI artifact is named with the tested commit SHA and contains `server.log` plus `test-results/`. The linked CI and deployment runs are authoritative for the tested commit above. This evidence update changes documentation only.
