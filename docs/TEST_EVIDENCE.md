# Production test evidence

- Recorded: `2026-09-23T22:52:52+07:00`
- Tested `main` commit: `b5b77f938727d5a42d549fad1ecb57570319fc99`
- Relevant fixes: [Edge authentication PR #13](https://github.com/NNH18/Namecard/pull/13), [browser authentication PR #14](https://github.com/NNH18/Namecard/pull/14)
- Commit-bound CI: [GitHub Actions run 35883421461](https://github.com/NNH18/Namecard/actions/runs/35883421461)
- Commit-bound Pages deployment: [GitHub Pages run 35883421443](https://github.com/NNH18/Namecard/actions/runs/35883421443)
- Supabase production deployment: [run 35881652578](https://github.com/NNH18/Namecard/actions/runs/35881652578)
- Hosted app: [https://nnh18.github.io/Namecard/](https://nnh18.github.io/Namecard/)
- Production project: Supabase `cialfrsnuhcxdqjzzeha` in `ap-southeast-1`
- CI environment: GitHub-hosted Ubuntu runner, Node `24.19.0`, Deno `2.9.7`, Supabase CLI `2.117.0`
- Data policy: generated fixtures and ephemeral `example.test` accounts only; no real-card PII was used or committed

| Check | Result |
|---|---|
| `npm test` | PASS; 83/83 |
| `npm run check` | PASS |
| Edge Function `deno check` | PASS; resolver and research functions |
| `npm run build` | PASS |
| `npm run test:ocr` | PASS; `vie+eng`, offline assets, worker/WASM and CSP checks |
| `npm run test:visual` | PASS; 320/390/1024 px, dark/responsive and workflow smoke |
| `npm run mobile:sync` | PASS locally; Android/iOS web assets synchronized |
| `supabase db reset` | PASS in GitHub Actions database job |
| `supabase test db` | PASS in GitHub Actions database job; 27 pgTAP assertions |
| GitHub Actions `web` / `database` | PASS on the tested commit |
| GitHub Pages | PASS; HTTP 200, cloud config injected, CSP bound to the production Supabase origin |
| Supabase production workflow | PASS; migrations, server secrets and both Edge Functions verified |
| Live API smoke | PASS; two-account RLS, direct-DML denial, idempotency, stale conflict, private Storage and scoped export |
| Live Company Research | PASS; provider call, atomic persistence, 100% evidence coverage for the generated fixture and cache hit |
| Public-browser E2E | PASS; sign-in, deterministic OCR boundary, review/save, remote persistence, private image, automatic research, offline search, reload/login, second browser context and sign-out; zero browser console errors |
| Test-data cleanup | PASS; zero temporary test users and zero objects at the private bucket root after verification |

The public-browser test uses a deterministic generated OCR result to verify UI-to-backend behavior. The separate OCR smoke suite exercises the packaged local Tesseract `vie+eng` runtime. Technical deployment is proven for generated data. Legal/privacy review, retention approval, backup/restore exercise, Android/iOS device validation, threat-model review and incident/support ownership remain external gates before real-card pilot data.
