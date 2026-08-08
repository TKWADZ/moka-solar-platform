# Deploy Status

## SOLARMAN HTTP 412 investigation (local only)

- latest task: Verify whether the current SOLARMAN Business OAuth refresh flow can support unattended read-only sync after manual Turnstile authorization
- browser/session safety: Existing authorized SOLARMAN tab was preserved; no logout, cookie read, browser-storage read, password read, token read, raw HAR capture, or customer payload commit occurred
- verified public contract: Refresh grant field names, Bearer usage, station search, device list, realtime day record, daily aggregate, and yearly aggregate routes/request shapes were verified from the current first-party bundle
- current decision: Local Outcome 1 is proven without browser cookies (`refresh=200`, rotated refresh token returned, station search `200`, four stations, expected plant matched); VPS proof is still pending and `WEB_OAUTH_REFRESH_TOKEN` remains unimplemented
- local safety patch: Legacy web password login and retry-on-412 were removed from the normal path; Business web 401/403/412 now stops as `AUTH_REQUIRED`; Official OpenAPI retains a single safe auth retry
- data mapping: Verified aggregate fields now map `generationValue`, `useValue`, `buyValue`, `gridValue`, `chargeValue`, and `dischargeValue`; rows missing PV production are discarded instead of stored as zero
- token safety: SOLARMAN token previews were removed from frontend APIs/UI; configurable Authorization/Cookie/CSRF/Turnstile headers are rejected
- decision-test tool: `cd backend && npm run solarman:test-refresh-decision`; secret input is hidden, memory-only, and never accepted through CLI args/env/files
- hidden prompt safety: Configurable limit with a 16,384-character default; SOLARMAN explicitly uses 16,384 and accepts multi-character paste chunks without silent truncation
- Windows terminal support: Windows Terminal/standard PowerShell paste is documented; PowerShell ISE is unsupported for raw hidden input
- unit test status: Passed 67/67 backend unit/regression tests, including 12 hidden-prompt cases and an exact 903-character fake token
- typecheck status: Passed backend `npm run typecheck`
- Prisma status: Schema valid and Prisma Client generated with a process-only validation URL; no migration was created or applied
- build status: Passed backend build and frontend production build (51 routes)
- approval requested or not: No
- approved or not: No
- deployed or not: No
- production changed: No
- remaining manual input: Run the same probe from an isolated VPS worktree using a newly issued refresh token entered only through hidden TTY; the token consumed by the local probe must never be reused
- rollback target if needed: `f09b96ee2b85e81f59f08132f62d25a37b96905b`

## Current provider integration candidate

- latest task: Preserve working Deye/LuxPower integrations, repair current SOLARMAN defaults, and add read-only GoodWe SEMS+ discovery to the unified Systems import workflow
- local test status: Passed 48/48 backend unit/regression tests; staff-auth e2e was discovered but skipped because this clean workspace has no `TEST_DATABASE_URL`
- build status: Passed backend typecheck/build and frontend production build (51 routes)
- Prisma status: Schema valid and Prisma Client generated with a process-only validation URL; no migration was created or applied
- provider safety: Deye and LuxPower request implementations are unchanged; failed/missing provider production remains null and cannot overwrite the latest valid value with zero
- SEMS+ scope: Current login/profile/station-list/station-detail contract is enabled read-only; device, realtime, history, and alarm requests remain disabled until sanitized request/response captures verify payloads and units
- SOLARMAN scope: Existing official OpenAPI remains preferred; only the current Business web origin and verified device-list fallback path were updated
- security review: Changed-file secret/PII scan passed; no raw HAR, cookie, token, password, customer address, personal email, or phone was added
- dependency warning: Existing backend production dependency tree reports 17 advisories (9 moderate, 7 high, 1 critical); automatic force-upgrades were not applied because they include breaking NestJS changes and are outside this provider patch
- approval requested or not: Yes
- approved or not: Yes
- deployed or not: Yes, commit `bc02e079e51c1ca727edbbda330f31a24429de4a` via GitHub Actions run `31235062498`
- production verification: Passed SSH deploy, PM2 restart, database health, 10 stability observations over 5 minutes, and public endpoint checks
- production changed: Yes, provider integration code/config only; no Prisma migration or production data change
- rollback target if needed: `4eda4d41f2bfa5f5c3c030309351dd16bb25ebde`

## Current release candidate

- latest task: Redesign Admin Systems from manual-first to provider-discovery-first
- local implementation status: Complete and deployed; unified discovery adapters, import/upsert, assignment, safe linking, disconnected state, manual fallback, and import-first UI are live
- database migration: `20260808163000_provider_plant_discovery` applied to production by the approved deploy workflow
- unit test status: Passed 41/41, including 15 provider-discovery/import and API-boundary safety tests
- typecheck status: Passed backend `npm run typecheck`
- Prisma status: Schema valid, Prisma Client generated, and production migration completed successfully
- build status: Passed backend `npm run build` and frontend `npm run build` (51 routes)
- security review: Provider/user credentials and raw provider/device payloads are excluded from Systems API responses; changed-file secret scan passed
- local browser status: Next.js started on `http://127.0.0.1:3100` without console errors; protected `/admin/systems` correctly redirected to login because this clean worktree has no local authenticated backend/session
- production verification: GitHub Actions run `31232660231` passed; public health checks and the 5-minute stability observation passed; authenticated `/admin/systems` shows the provider-first workflow without console errors
- approval requested or not: Yes
- approved or not: Yes
- deployed or not: Yes, commit `ce1fafdd244ddfc8949f0511937d620c08c1466f`
- production changed: Yes, additive schema migration and Admin Systems workflow only
- remaining input: Sanitized SEMS+ request contract is still required before enabling SEMS+ account discovery
- rollback target if needed: `5c12c7265cbcb55ee5348a5b7d53eb64bb608fc6`

## Previous SEMS+ reviewed import

- latest task: Capture authorized, visible SEMS+ plant/device/monthly report data and prepare a safe Moka operational-data import preview
- local capture status: Passed; 8 plants captured from rendered SEMS+ pages without reading credentials, cookies, browser storage, authorization headers, tokens, or network response bodies
- private capture: `imports/sems-plus/capture-2026-08-08.json` (Git ignored)
- generated preview: `imports/sems-plus/moka-preview-2026-08-08.xlsx` (Git ignored)
- import preview status: 1 reviewed `AT001` row in `Import ready`, 7 rows in `Needs review`, 64 daily debug rows; unlinked and offline/zero-only plants remain blocked
- linkage safety: `Import ready` now requires an explicitly approved `stationId -> systemCode` mapping; fuzzy name matching is not used by the preview generator
- production linkage review: User approved the SEMS+ plant link to `AT001`; the other 7 plants remain unlinked
- database write status: Production import completed for exactly 1 `AT001` monthly record for `08/2026`; the other 7 SEMS+ plants were not uploaded
- billing status: Provisional `ESTIMATED` billing was synchronized from 415.1 kWh PV; grid import remains separate from consumption and no consumption value was invented
- unit test status: Passed 26/26
- typecheck status: Passed backend `npm run typecheck`
- Prisma status: Schema valid and Prisma Client generated successfully; no migration was created or applied
- build status: Passed backend `npm run build` and frontend `npm run build` (51 routes)
- approval requested or not: Yes, specifically for the reviewed `AT001` data row
- approved or not: Yes; the user corrected and approved the link to `AT001`
- deployed or not: No code deployment; one approved production data import completed
- production changed: Yes, data only; `AT001` now has the `08/2026` SEMS+ visible-report record and provisional billing
- remaining input: Provide reviewed mappings for any of the remaining 7 SEMS+ plants before another production upload
- production data rollback note: If the `AT001` mapping is later rejected, remove or correct only the `AT001` `08/2026` operational record and its linked estimate; do not perform a bulk rollback
- unattended sync prerequisite: Sanitized SEMS+ API documentation/HAR for plant list, overview, devices, realtime flow, daily/monthly history, and session expiry; endpoint paths must not be guessed
- rollback target if needed: `7ea065d1863edc5a7381f8a989a50ae5b96d5ce4`
