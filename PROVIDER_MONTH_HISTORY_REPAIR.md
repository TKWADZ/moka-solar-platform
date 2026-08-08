# Provider Month History Repair

## Safety status

- The repair command defaults to `--dry-run`.
- `SOLARMAN_HISTORY_BILLING_ENABLED` and `SEMS_PLUS_HISTORY_BILLING_ENABLED` default to `false`.
- Apply mode is prohibited until the dry-run report, PostgreSQL backup and accounting impact have been reviewed and explicitly approved.
- The repair targets only the confirmed SOLARMAN bare-month parser signature. It does not delete all records from 2001.
- The operator confirmed the affected installations began in 2025. The repair still avoids a global hard-coded year: each candidate period must predate that system's `installDate`, then `startedAt`, then `createdAt` fallback.
- CSV imports, manual records, admin sync records and manual overrides are authoritative and are never selected for automatic quarantine.
- Issued, overdue, partially paid and paid invoices are reported as `NEEDS_MANUAL_FINANCIAL_REVIEW` and are not changed.

## Root cause

The old parser passed bare month labels such as `"11"` to JavaScript date parsing. JavaScript interpreted these labels around 2001, and the provider/server timezone boundary produced the observed range `12/2000..11/2001`. These periods predate the confirmed 2025 installations and cannot be legitimate operating history. The strict parser now resolves bare values `1..12` only as month numbers under the caller-supplied expected year and station context.

## Local validation

```powershell
cd D:\thietkeweb\mokasolar-sems-plus-discovery\backend
npm run data:repair-provider-months -- --dry-run --system-id=<SYSTEM_ID> --station-id=<STATION_ID>
```

The report contains only system IDs, masked station IDs, periods, source names, timestamps, counts and financial-reference counts. It does not print provider payloads, credentials or customer details.

## Production backup

Run from the production backend working directory without printing `DATABASE_URL`:

```bash
set -a
. ./.env
set +a
BACKUP_DIR=/root/moka-solar-backups/provider-month-repair-$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 700 "$BACKUP_DIR"
pg_dump --format=custom --no-owner --no-acl --file "$BACKUP_DIR/moka-before-provider-month-repair.dump" "$DATABASE_URL"
pg_restore --list "$BACKUP_DIR/moka-before-provider-month-repair.dump" >/dev/null
```

Record the absolute backup file path. Do not remove or replace existing backups.

## Production dry-run

```bash
cd /path/to/moka-solar-platform/backend
npm run data:repair-provider-months -- --dry-run --system-id=<SYSTEM_ID> --station-id=<STATION_ID>
```

Review all of the following before approval:

- invalid energy and billing counts;
- invoice status counts and related invoice item/payment/Zalo references;
- candidate creation and sync timestamps;
- preserved CSV/manual periods and manual overrides;
- every `NEEDS_MANUAL_FINANCIAL_REVIEW` item.

## Apply after explicit approval only

```bash
cd /path/to/moka-solar-platform/backend
npm run data:repair-provider-months -- --apply \
  --system-id=<SYSTEM_ID> \
  --station-id=<STATION_ID> \
  --backup-reference=/absolute/path/to/moka-before-provider-month-repair.dump \
  --actor-user-id=<SUPER_ADMIN_USER_ID> \
  --confirm=QUARANTINE_CONFIRMED_SOLARMAN_PROVIDER_MONTHS
```

Apply mode validates a non-empty PostgreSQL custom/plain-SQL dump header, requires a Super Admin audit actor, runs in a transaction, writes audit logs and uses soft deletion. It never modifies financially locked invoices automatically.

## Rollback plan

1. Stop further provider history synchronization for the affected system and keep both billing feature flags disabled.
2. Keep the live database intact. Restore the custom-format backup into an isolated PostgreSQL recovery database first:

```bash
createdb moka_recovery_provider_months
pg_restore --clean --if-exists --no-owner --no-acl --dbname=moka_recovery_provider_months /absolute/path/to/moka-before-provider-month-repair.dump
```

3. Compare only the affected IDs and periods against the repair audit actions `INVALID_PROVIDER_MONTH_ENERGY_QUARANTINED` and `INVALID_PROVIDER_MONTH_BILLING_QUARANTINED`.
4. Prepare a targeted transactional rollback that restores the prior `deletedAt`, billing linkage and mutable invoice status from the isolated backup. Have accounting review it before execution.
5. Do not restore the whole production database over the live instance unless a separate full-disaster-recovery approval is given.

## SEMS+ behavior

SEMS+ authentication, plant discovery, station metadata and already verified overview fields remain available. Monthly history remains explicitly `UNVERIFIED`, creates no monthly billing records, and displays: `SEMS+ chưa có dữ liệu lịch sử tháng được xác minh.`
