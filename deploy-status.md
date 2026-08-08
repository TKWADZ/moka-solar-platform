# Deploy Status

## Provider monthly-history integrity repair (local only, awaiting review)

- latest task: Prevent malformed SOLARMAN month labels from creating false historical energy/billing periods and prepare a reversible quarantine workflow
- branch / base HEAD: `fix/sems-plus-live-discovery` / `cceef75c28873e05d87609476a4ed9b5b54954eb`
- confirmed root cause: Bare month labels were passed to implementation-dependent JavaScript date parsing; strict parsing now uses caller-supplied station, expected year and timezone context
- production UI read-only audit: The target system currently shows 5 authoritative `CSV_IMPORT` periods (`12/2025` through `04/2026`) and 12 suspicious `SOLARMAN_DAILY_AGGREGATE` periods (`12/2000` through `11/2001`)
- installation boundary confirmed by operator: affected projects were installed from 2025; repair candidates must also predate each system's own install/start/create year, without a global hard-coded installation year
- related billing UI audit: 9 suspicious provider periods have billing estimates, all still show the `Xuat hoa don` action, and no linked invoice was observed for those suspicious periods
- manual-data safety: CSV/manual/admin-sync/manual-override sources are locked against provider overwrite; the five reviewed CSV periods are outside automatic repair actions
- billing safety: `SOLARMAN_HISTORY_BILLING_ENABLED=false` and `SEMS_PLUS_HISTORY_BILLING_ENABLED=false` by default; unverified SEMS+ is no longer considered a stable auto-billing provider
- repair safety: CLI defaults to dry-run, requires exact system/station scope, a recognized PostgreSQL backup, Super Admin actor and confirmation phrase for apply; financially locked invoices are review-only
- local dry-run: Passed against isolated local `moka_solar_local`; 0 candidates and 0 writes because this local database does not contain the production defect
- production CLI dry-run: Not executed because unattended SSH authentication is unavailable; SSH failed before login, and no VPS command ran
- backup status: Existing local April backup is malformed and correctly rejected by the new backup guard; no production backup was created or modified
- Prisma status: Schema valid and client generated; no schema migration was created
- unit/regression status: Passed 111/111, including Deye/LuxPower regression, parser boundaries, per-system history start boundaries, manual locks, dry-run no-write, backup validation, SEMS+ empty-history behavior and access safety
- build status: Backend typecheck/build passed; frontend production build passed with 51 routes
- integration status: Staff-auth e2e discovered but skipped because this isolated worktree has no `TEST_DATABASE_URL`; no database was substituted
- secret/PII scan: Passed 25 changed/untracked files; no private key, JWT, long opaque token, personal email, phone, HAR, cookie jar or session-state artifact found
- approval requested or not: Yes, code deployment requested after local verification; production data cleanup remains a separate approval gate
- approved or not: Yes, user explicitly approved code deployment
- deployed or not: In progress
- production cleanup applied: No
- rollback target if needed: `cceef75c28873e05d87609476a4ed9b5b54954eb`; production data cleanup is not part of this deployment

## SEMS+ shared environment persistence guard (deployed)

- latest task: Prevent future deploys from silently replacing a newer canonical backend environment with an older shared environment
- root cause: An atomic environment update replaced the canonical `backend/.env` symlink with a regular file; the next multi-site deploy relinked the older shared file and discarded the divergent configuration
- local fix: The multi-site preparation script now backs up and rejects divergent environment files instead of replacing either copy
- recovery status: Restored all 7 SEMS+ keys from deploy backup `20260808-205020` into the canonical shared backend environment without printing secret values
- recovery verification: Backend health is `ok`; Admin Systems reports one configured GoodWe SEMS+ connection
- guard test status: Passed `ENV_DIVERGENCE_GUARD_OK`; both divergent source and shared files remained unchanged and a backup copy was created
- database change: None; no migration
- approval requested or not: Yes
- approved or not: Yes
- deployed or not: Yes, commit `615549c97a0897e3b377c188862ec14958424f9f` via GitHub Actions run `31261267028`
- production verification: Workflow passed SSH deploy, 5-minute stability observation, and public endpoint checks; after that deploy Admin Systems still reported `CONFIGURED` and discovered all 8 plants in about 11.3 seconds
- production import status: Not started; total Moka systems remained 16 before and after preview
- rollback target if needed: `dc54e344c0d3157a5e4c805761632e627553591f`

## SEMS+ provider discovery timeout hotfix (deployed)

- latest task: Allow the unified Systems screen to finish current GoodWe SEMS+ plant discovery without changing the verified provider adapter
- root cause: The frontend aborted every API request after 8 seconds while SEMS+ discovery fetches profile, station list, and detail data for all 8 plants
- local fix: Provider preview/import requests now use a dedicated 60-second timeout; all other API requests retain the existing 8-second timeout
- provider behavior: GoodWe endpoints, session handling, mappings, read-only scope, and import safeguards are unchanged
- local test status: Passed frontend production build with 51 routes, backend build/typecheck, and 82/82 backend unit/regression tests
- secret scan status: Passed changed-tree scan; no credential, token, cookie, session, or private key was added
- database change: None; no migration
- approval requested or not: Yes
- approved or not: Yes
- deployed or not: Yes, commit `dc54e344c0d3157a5e4c805761632e627553591f` via GitHub Actions run `31260472833`
- production verification: Workflow passed SSH deploy, 5-minute stability observation, and public endpoint checks; authenticated preview discovered all 8 SEMS+ plants without timeout
- production import status: Not started; plant import remains an explicit separate operator action
- rollback target if needed: `9dc63ca7bfd9a1929168d0ec96a995f20fc6e0fc`

## SEMS+ live discovery integration (deployed)

- latest task: Verify current GoodWe SEMS+ login/session and read-only plant discovery before production activation
- branch: `fix/sems-plus-live-discovery`
- local probe status: Passed; HTTP `200`, provider status `00000`, 8 unique plants, 8/8 station details, 7 online, 1 offline, and 8 plants with day/total generation fields
- mapping status: Current `installedCapacity`, `proToday`, `proTotal`, and numeric station status fields are normalized; missing values remain `null`; `psystem` remains intentionally unmapped
- secret handling: Credentials were entered only through hidden interactive input; no credential, token, session document, raw HAR, customer name, or address was stored
- test status: Passed 82/82 backend unit/regression tests; Prisma validate/generate, backend typecheck/build, and frontend production build with 51 routes all passed
- integration test status: Staff-auth e2e skipped because this isolated worktree has no `TEST_DATABASE_URL`; no production database was used
- secret scan status: Passed changed-tree scan; no credential, token, JWT, private key, HAR, cookie jar, or session artifact found
- VPS probe status: Passed from an isolated temporary worktree; HTTP `200`, provider status `00000`, 8 unique plants, 8/8 station details, 7 online, 1 offline, and 8 plants with day/total generation fields
- production probe safety: The isolated VPS probe did not restart PM2, read or modify production `.env`, access the database, run a migration, or change the production checkout
- implementation commit: `5a7ba0917c338c182fa57b26cefcfcc2c1bd74fc`
- database change: None; no migration
- approval requested or not: Yes
- approved or not: Yes
- deployed or not: Yes, release commit `12c7ada074db181e64e8a4e3eb0f23c786378f35` via GitHub Actions run `31259092766`
- production stack: PM2 through the existing production workflow
- production verification: Homepage `200`, Next.js asset `200`, `/admin/systems` `200`, `/api/health` status `ok`, database `up`, HTTP/www redirects `301`, and 10/10 external stability observations passed
- rollback target if needed: `51ab749fe0bc238c53363b1c89fa503d82e3f5a2`

## SOLARMAN station timestamp/power hotfix (deployed)

- latest task: Fix `AUTHORIZE_WEB_OAUTH` system creation failure caused by a Unix-seconds `lastUpdateTime`
- root cause: Station parsing converted the numeric epoch to a plain string, then `new Date('1786171604')` produced an invalid `Date` that Prisma rejected
- local fix: Normalize provider timestamps from epoch seconds, epoch milliseconds, ISO strings, or `Date`; invalid values now become `null` and never reach Prisma as `Invalid Date`
- power correction: Verified SOLARMAN `generationPower`/`currentPower` values are converted from W to kW; explicit `generationPowerKw`/`currentPowerKw` values remain unchanged
- focused test status: Passed 21/21 SOLARMAN provider/OAuth tests
- full test status: Passed 79/79 backend unit/regression tests
- typecheck/build status: Backend typecheck and production build passed; frontend production build passed with 51 routes
- secret scan status: Passed changed-tree scan; no token, authorization value, cookie, password, address, phone, or private key added
- database change: None; no migration required
- approval requested or not: Yes
- approved or not: Yes
- deployed or not: Yes, commit `5ddce2cbd2e9622cb1a871d3d41e352399f2ffaa` via GitHub Actions run `31254836379`
- production verification: Homepage `200`, `/admin/solarman` `200`, `/api/health` status `ok`, database `up`, and public workflow verification passed
- production changed: Yes, SOLARMAN timestamp/power normalization only; no schema migration or production data change
- rollback target if needed: `bff1760d2146e05ca36ed5f6f1bf51b0710122af`

## SOLARMAN advisory-lock hotfix (deployed)

- latest task: Fix Prisma runtime failure when PostgreSQL `pg_advisory_xact_lock` returns the unsupported `void` type
- root cause: Prisma could not deserialize the raw `void` column before the refresh/station sync operation ran
- local fix: Cast the advisory-lock result to PostgreSQL `text`; locking scope and token behavior remain unchanged
- focused test status: Passed 9/9 SOLARMAN OAuth tests, including a regression assertion for the SQL cast
- full test status: Passed 77/77 backend unit/regression tests
- typecheck/build status: Backend typecheck and production build passed
- database change: None; no migration required
- approval requested or not: Yes
- approved or not: Yes
- deployed or not: Yes, commit `bff1760d2146e05ca36ed5f6f1bf51b0710122af` via GitHub Actions run `31244449382`
- production verification: Homepage `200`, `/admin/solarman` `200`, `/api/health` status `ok`, database `up`, and public workflow verification passed
- production changed: Yes, backend SQL result casting only; no schema migration or production data change
- rollback target if needed: `a2a1503d97b7b44eb4fb754e3791828ca4477068`

## SOLARMAN Web OAuth release candidate (local only)

- latest task: Implement VPS-proven SOLARMAN Business OAuth refresh-token sync after manual Turnstile authorization
- browser/session safety: Existing authorized SOLARMAN tab was preserved; no logout, cookie read, browser-storage read, password read, token read, raw HAR capture, or customer payload commit occurred
- verified public contract: Refresh grant field names, Bearer usage, station search, device list, realtime day record, daily aggregate, and yearly aggregate routes/request shapes were verified from the current first-party bundle
- current decision: Outcome 1 is proven locally and from an isolated VPS worktree (`refresh=200`, rotated refresh token returned, station search `200`, four stations, expected plant matched)
- provider mode: `WEB_OAUTH_REFRESH_TOKEN` implemented locally with encrypted token storage, proactive refresh, atomic rotation and PostgreSQL advisory locking per connection
- authorization UX: Super Admin/Admin one-time token submission; Manager/Staff never see the secret input; connection becomes `VERIFIED` only after station discovery
- discovery behavior: all returned stations are upserted by provider + station ID; repeated discovery is idempotent and Moka-owned customer/contract/pricing fields are preserved
- local safety patch: Legacy web password login and retry-on-412 were removed from the normal path; Business web 401/403/412 now stops as `AUTH_REQUIRED`; Official OpenAPI retains a single safe auth retry
- data mapping: Verified aggregate fields now map `generationValue`, `useValue`, `buyValue`, `gridValue`, `chargeValue`, and `dischargeValue`; rows missing PV production are discarded instead of stored as zero
- token safety: SOLARMAN token previews were removed from frontend APIs/UI; configurable Authorization/Cookie/CSRF/Turnstile headers are rejected
- decision-test tool: `cd backend && npm run solarman:test-refresh-decision`; secret input is hidden, memory-only, and never accepted through CLI args/env/files
- hidden prompt safety: Configurable limit with a 16,384-character default; SOLARMAN explicitly uses 16,384 and accepts multi-character paste chunks without silent truncation
- Windows terminal support: Windows Terminal/standard PowerShell paste is documented; PowerShell ISE is unsupported for raw hidden input
- unit/regression test status: Passed 76/76, including SOLARMAN OAuth, Deye, LuxPower, provider discovery, billing safety, Zalo safety and auth tests
- typecheck status: Passed backend `npm run typecheck`
- Prisma status: Schema validated and client generated; additive migration `20260808190000_solarman_web_oauth_refresh_token` applied successfully in production
- build status: Backend build passed; frontend production build passed (51 routes)
- integration test status: Staff-auth e2e skipped because this isolated workspace has no `TEST_DATABASE_URL`; no production database was used
- secret scan status: Passed changed-tree checks; no long token/JWT pattern, HAR, session state, proof output, cookie or raw credential artifact found
- approval requested or not: Yes
- approved or not: Yes
- deployed or not: Yes, commit `a2a1503d97b7b44eb4fb754e3791828ca4477068` via GitHub Actions run `31243079350`
- production changed: Yes, additive SOLARMAN OAuth schema and application release only; no existing billing/customer data reset
- production stack: PM2; backend and frontend remained online with zero restarts through 10 observations over 5 minutes
- production verification: Homepage `200`, `/admin/solarman` `200`, `/api/health` status `ok`, database `up`, and public workflow checks passed
- production proof safety: Production checkout unchanged, no PM2 restart, no database/environment modification, and temporary VPS worktree removed
- remaining manual input: None for implementation; a new token is needed only when an authorized admin performs the eventual production authorization
- rollback target if needed: `f09b96ee2b85e81f59f08132f62d25a37b96905b` (the additive database columns may remain safely in place)

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
