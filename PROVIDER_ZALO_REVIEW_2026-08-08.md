# Provider and Zalo Review - 2026-08-08

## Source and branch safety

- Review bundle baseline: `5362594b615fb298b10e3849b45cf82576f3d893`.
- Working branch base: `5c12c7265cbcb55ee5348a5b7d53eb64bb608fc6`.
- The baseline is an ancestor of the working branch base.
- The newer Staff/Admin Zalo OTP recovery commits remain intact.
- The review patch did not modify `backend/src/auth/**`, Staff recovery pages,
  `.github/workflows/deploy.yml`, or `deploy-status.md`.
- The overlay ZIP was not applied.

## Applied review patch

All hunks from `moka-solar-platform-review-latest-5362594b.patch` passed
`git apply --check` and were applied once. The only offsets were in env examples,
Zalo documentation, and the Zalo service because the current branch is newer than
the bundle baseline.

Applied areas:

- reject missing/invalid daily inverter generation before energy-record upsert;
- disable mock energy synchronization by default and always in production;
- stop SEMS realtime data from being copied into historical missing days;
- repair Deye auth retry behavior and business-company token acquisition;
- repair SOLARMAN OpenAPI token query, password hash, bearer header, expiry, and
  persisted-session propagation;
- preserve customer invoice/PDF/payment-proof access through service ownership
  checks;
- normalize billing and monitor timezone to `Asia/Ho_Chi_Minh`;
- add disabled-by-default Zalo invoice/reminder/paid automation with manual dry-run
  as the default;
- deduplicate successful invoice/paid notification sends using existing logs.

Additional local hardening:

- Deye provider 4xx responses are not retried;
- mock payment is blocked for every role in production and unless its explicit
  development flag is enabled;
- mixed customer/staff routes preserve staff permission checks while customer
  requests continue through ownership checks;
- Docker Compose defaults match the safe env examples: energy/payment mocks off,
  Zalo dry-run on, and Zalo automation off;
- focused provider, ownership, payment, and Zalo safety tests were added.
- a pure SEMS+ mapper merges the full and enriched plant lists, keeps offline
  plants, maps documented production kWh fields to the legacy contract, and keeps
  `pSystem` unmapped until a sanitized energy-flow fixture proves its unit.

## Deferred P1 work

These items need separate reviewed changes and were not mixed into this patch:

1. JWT startup validation: auth currently has implicit `super_secret_key`
   fallbacks. Replace them with a shared typed config validator and production
   startup refusal in a dedicated auth-safe change.
2. Provider token encryption: Deye and SOLARMAN access/refresh token fields remain
   plaintext database columns. Add versioned AES-256-GCM columns, a staged data
   migration, verification release, and key-rotation runbook before removing old
   columns.
3. Zalo durable outbox: the current in-process lock and log lookup do not protect
   multiple PM2/container workers. Keep automation disabled until a PostgreSQL
   outbox, atomic claim, lease recovery, retry/dead-letter state, and distributed
   scheduler lock are implemented.
4. Payment reconciliation: production mock payment is now blocked. A real partial
   and full reconciliation endpoint still needs amount validation, idempotency,
   transaction locking, and audit coverage.
5. Provider health: `/api/health` checks PostgreSQL only. Add separate live/ready
   endpoints and cached authenticated provider probes.
6. Universal provider contract: `MonitorSyncService` still branches directly on
   SEMS, SOLARMAN, Deye, and LuxPower. Introduce adapters and a legacy mapper one
   provider at a time without changing billing formulas.

## GoodWe SEMS+ network evidence still required

Provide sanitized HAR or cURL entries for:

- login/session creation and redirects;
- current-user/profile;
- full plant list;
- enriched station overview;
- device/inverter list;
- realtime energy flow;
- daily and monthly history;
- alarm list only if alarm synchronization is required;
- documented session-expired response.

Keep URL, method, content type, query/body schema, header names, cookie names,
status code, and response schema. Remove password, cookie values, access tokens,
Authorization values, customer addresses, and other personal data.

No SEMS+ JSON or HAR fixture file was present in the repository, bundle, or local
workspace. The mapper therefore has structural unit fixtures only; a vendor-fixture
contract test must be added when the sanitized responses are supplied.

## LuxPower network evidence still required

Provide sanitized HAR or cURL entries for:

- login, redirect chain, cookie names, and CSRF requirements;
- plant list;
- inverter/device list;
- runtime metrics;
- daily, monthly, yearly, and total energy chart requests;
- session-expired response, including HTTP-200 login HTML behavior if present.

No replacement LuxPower or GoodWe endpoint was guessed in this review.

## Safe environment defaults

```env
ENABLE_CUSTOMER_MOCK_PAYMENT=false
ENABLE_ENERGY_MOCK_SYNC=false
MONITOR_SYNC_TIMEZONE=Asia/Ho_Chi_Minh
BILLING_TIMEZONE=Asia/Ho_Chi_Minh

ZALO_DRY_RUN=true
ZALO_AUTOMATION_ENABLED=false
ZALO_AUTOMATION_CRON=0 */15 * * * *
ZALO_AUTOMATION_TIMEZONE=Asia/Ho_Chi_Minh
ZALO_AUTOMATION_BATCH_SIZE=50
ZALO_INVOICE_LOOKBACK_DAYS=60
ZALO_REMINDER_DAYS_BEFORE_DUE=3
ZALO_REMINDER_COOLDOWN_HOURS=72
ZALO_RETRY_COOLDOWN_HOURS=6
ZALO_PAID_LOOKBACK_DAYS=30
```

Live Zalo automation additionally requires verified OA credentials and approved,
exact template IDs for `INVOICE`, `REMINDER`, and `PAID`. The OTP template remains
separate. Do not store real values in Git.

## Validation completed

- backend and frontend `npm ci` completed from lockfiles;
- Prisma schema validation and client generation passed;
- backend unit/safety tests: 18 passed, 0 failed;
- backend typecheck passed;
- backend production build passed;
- frontend production build passed, including all 51 routes;
- all 35 migrations applied to an isolated temporary PostgreSQL database;
- Staff/Admin/customer auth e2e passed against that isolated database;
- production and development Docker Compose config validation passed;
- the temporary PostgreSQL container used no volume and was removed after tests.

No live provider or Zalo message call was made because no production credentials
or approved live-test recipient was used.

## Changed files

```text
.env.example
.env.production.example
PROVIDER_ZALO_REVIEW_2026-08-08.md
ZALO_INTEGRATION.md
backend/.env.example
backend/package.json
backend/src/app.module.ts
backend/src/billing-lifecycle/billing-lifecycle.provider-safety.spec.ts
backend/src/billing-lifecycle/billing-lifecycle.service.ts
backend/src/deye-connections/deye-api.service.ts
backend/src/deye-connections/deye-api.spec.ts
backend/src/deye-connections/deye-auth.service.ts
backend/src/energy-records/energy-records.provider-safety.spec.ts
backend/src/energy-records/energy-records.service.ts
backend/src/energy-records/sems-plus.mapper.spec.ts
backend/src/energy-records/sems-plus.mapper.ts
backend/src/energy-records/solarman-auth.spec.ts
backend/src/energy-records/solarman.service.ts
backend/src/invoices/invoice-access.spec.ts
backend/src/invoices/invoices.controller.ts
backend/src/invoices/invoices.service.ts
backend/src/monitor-sync/monitor-sync.module.ts
backend/src/monitor-sync/monitor-sync.service.ts
backend/src/monthly-pv-billings/monthly-pv-billings.service.ts
backend/src/payments/payments.controller.ts
backend/src/payments/payments.production-safety.spec.ts
backend/src/payments/payments.service.ts
backend/src/solarman-connections/solarman-client.service.ts
backend/src/solarman-connections/solarman-connections.service.ts
backend/src/solarman-connections/solarman-cookie-session.provider.ts
backend/src/solarman-connections/solarman-official-openapi.provider.ts
backend/src/zalo-notifications/zalo-automation.service.ts
backend/src/zalo-notifications/zalo-automation.spec.ts
backend/src/zalo-notifications/zalo-notifications.controller.ts
backend/src/zalo-notifications/zalo-notifications.module.ts
backend/src/zalo-notifications/zalo-notifications.service.ts
docker-compose.prod.yml
docker-compose.yml
```

## Deployment commands - do not run without explicit approval

Push the review branch without deploying:

```bash
git push -u origin fix/inverter-providers-zalo-automation
```

Open and review a pull request. Merging to `main` triggers the production workflow,
so merge only after explicit deployment approval and credential/template checks.

## Rollback

Before merge, revert a logical review commit with:

```bash
git revert <commit-sha>
```

After an approved production merge, create a revert commit for the merge or the
logical review commits and push that revert through the normal guarded workflow:

```bash
git revert <merge-or-commit-sha>
git push origin main
```

Do not reset/drop the database or delete provider, billing, payment, or Zalo logs.
This review adds no Prisma migration.
