# Billing Continuity Changelog - 2026-04-16

## Scope

Fix meter continuity so `old_reading` always follows the previous period `new_reading`
unless there is a confirmed meter reset / meter replaced / contract restart flag.

## Root cause

- Billing, invoice, and customer portal paths were not using one shared continuity chain.
- Some flows accepted provider or imported placeholder values like `old_reading = 0`
  for later periods.
- Historical UI could show continuity derived from inconsistent sources.

## What changed

- Added a shared backend continuity helper that derives:
  - `old_reading[current] = new_reading[previous]`
  - `new_reading[current] = old_reading[current] + consumption[current]`
- Added reset-aware handling for:
  - `meterReset`
  - `meterReplaced`
  - `contractRestart`
- Added continuity validation so broken chains are flagged and invoice generation is blocked
  unless a confirmed reset exists.
- Updated customer/admin/invoice/report pipelines to use the same derived continuity values.
- Added a safe CLI backfill command for historical `MonthlyEnergyRecord` rows.

## Files changed

- `backend/src/common/helpers/operational-period.helper.ts`
- `backend/src/operational-data/dto/upsert-operational-record.dto.ts`
- `backend/src/operational-data/operational-data.service.ts`
- `backend/src/operational-data/rebuild-meter-continuity.ts`
- `backend/src/monthly-pv-billings/monthly-pv-billings.service.ts`
- `backend/src/invoices/invoices.service.ts`
- `backend/src/reports/customer-portal-aggregate.service.ts`
- `backend/src/reports/reports.service.ts`
- `backend/package.json`
- `frontend/src/types/index.ts`

## Backfill command

Dry run:

```bash
npm run meter:rebuild-continuity -- --customer-name="Nha Van Phuc" --dry-run
```

Apply changes:

```bash
npm run meter:rebuild-continuity -- --customer-name="Nha Van Phuc"
```

You can also target one system directly:

```bash
npm run meter:rebuild-continuity -- --system-id=<solar_system_id>
```

## Local note

The current local database does not contain the real `Nha Van Phuc` customer record,
so customer-specific backfill could not be executed locally. The shared continuity fix,
validation, and backfill command are ready for the environment that actually contains
that customer history.
