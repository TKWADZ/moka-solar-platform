# SEMS+ visible report bridge

## Acquisition boundary

- The operator signs in to SEMS+ manually in their normal browser.
- Moka accepts only data visibly rendered in the authorized plant, device, or report page.
- The bridge does not read cookies, browser storage, authorization headers, tokens, passwords, or network response bodies.
- No SEMS+ endpoint path is inferred from the browser UI.

## Observed fields

The authorized SEMS+ UI currently exposes plant name/ID, inverter serial and status, current inverter power in kW, daily and accumulated production in kWh, and monthly report series for PV generation, battery charge/discharge, grid export, and grid import.

`Điện mua` is normalized as purchased/grid-import energy. It is not treated as load consumption. Moka only receives consumption when an independent supported consumption field exists.

## Local workflow

1. Save the rendered-data capture under `imports/sems-plus/`.
2. Create an ignored `system-links.json` containing only operator-approved `stationId -> systemCode` links.
3. Run `npm run sems-plus:prepare-import -- <capture.json> [preview.xlsx] [system-links.json]` in `backend`.
4. Review all station-to-system matches and the `Needs review` sheet.
5. Keep `syncBilling` disabled until the plant is linked to the correct Moka customer/system/contract and the period is approved.
6. Upload the reviewed workbook from Admin > Dữ liệu vận hành only after approval.

Unlinked or zero-only captures are never emitted into `Import ready`; this prevents fuzzy customer matching and prevents an offline or failed provider response from overwriting valid production with zero.

## Remaining requirement for unattended sync

Automatic server-side SEMS+ sync still requires sanitized first-party API documentation or a sanitized HAR covering plant list, station overview, device list, realtime energy flow, daily/monthly history, and session-expiry behavior. Do not add guessed endpoint paths or browser-session replay.
