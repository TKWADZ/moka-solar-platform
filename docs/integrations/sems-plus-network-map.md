# GoodWe SEMS+ read-only network map

## Capture status

This map was prepared on 2026-08-08 from the current first-party SEMS+ JavaScript bundles loaded by the authorized browser session and from rendered, read-only account pages. No cookie, token, password, browser storage, authorization value, or raw HAR file was read or stored.

The browser tooling available for this review did not expose request/response event bodies. Endpoint paths, methods, login payload shape, signature algorithm, and the station-page payload below are verified from the current first-party bundle. Response fields not represented by the sanitized fixtures remain unverified and are not mapped by the production client.

## Hosts and session

| Purpose | Verified value |
| --- | --- |
| Portal | `https://semsplus.goodwe.com` |
| Regional APIs | `https://au-semsplus.goodwe.com`, `https://cn-semsplus.goodwe.com`, `https://eu-semsplus.goodwe.com`, `https://hk-semsplus.goodwe.com`, `https://us-semsplus.goodwe.com` |
| Session header name | `token` containing a JSON session document |
| Request signature header | `X-Signature` |
| Signature | Base64 of `sha256(timestamp@uid@token)@timestamp` |
| Expiry handling | Provider codes `C0602`, `C0607`, and `100002` require one re-login attempt |

The login password field is Base64-encoded MD5 output, matching the current SEMS+ login bundle. Secret values are never returned to the Moka frontend or included in errors.

## Verified read-only requests

| Purpose | Method | Path |
| --- | --- | --- |
| Login | POST | `/web/sems/sems-user/api/v1/auth/cross-login` |
| Account/profile | GET | `/web/sems/sems-user/api/v1/user/get-user` |
| Station types | GET | `/sems/sems-dashboard-web/api/front/page/getStationType` |
| Full station page | POST | `/sems/sems-dashboard-web/api/front/page/stationPage` |
| Station detail | GET | `/sems/sems-dashboard-web/api/front/page/stationDetail/{stationId}` |
| Storage overview | GET | `/sems/sems-dashboard-web/api/front/page/storage/station/{stationType}` |
| Dashboard chart | POST | `/sems/sems-dashboard-web/api/front/page/chart` |
| Asset overview | GET | `/sems/sems-dashboard-web/api/front/page/getAssetOverview/{stationType}` |
| Dashboard metrics | POST | `/sems/sems-dashboard-web/api/front/page/metrics` |
| Station count | POST | `/sems/sems-dashboard-web/api/front/page/stationCount` |
| Device page | POST | `/web/sems/sems-plant/api/web/device/centralized/page` |
| Device status count | POST | `/web/sems/sems-plant/api/web/device/status/count` |
| Device search | POST | `/web/sems/sems-plant/api/web/device/global/search` |
| Station statistic report | POST | `/sems/sems-report/api/report/station/statistic` |
| Station realtime report | POST | `/sems/sems-report/api/report/station/real-time` |
| Inverter statistic report | POST | `/sems/sems-report/api/report/inverter/statistic` |
| Inverter realtime report | POST | `/sems/sems-report/api/report/inverter/real-time` |
| Alarm list | POST | `/web/sems/sems-alarm/api/v2/alarm/page` |
| Alarm detail | POST | `/web/sems/sems-alarm/api/v2/alarm/detail` |
| Alarm statistics | POST | `/web/sems/sems-alarm/api/alarm/statistics` |

The implemented unattended discovery uses only login, profile, station types, station page, and station detail. Device, realtime-flow, history, and alarm requests are documented but remain disabled until their sanitized request and response contracts are captured.

## Verified station-page request body

```json
{
  "size": 200,
  "current": 1,
  "order": { "column": "createTime", "asc": false },
  "stationTypeEnum": "<STATION_TYPE>",
  "stationAddress": null,
  "email": null,
  "phone": null,
  "unifiedTextSearch": null
}
```

Discovery first requests all station types, paginates every type, deduplicates by plant ID, and then enriches each plant with station detail. A failed detail request does not remove the base-list plant, including offline plants.

## Sanitized response fields used

- Identity: `id`, with compatibility aliases `plantId` and `stationId`.
- Name: `name`, `plantName`, or `stationName`.
- Capacity: `installedPower` in kWp only where the returned value is numeric.
- Energy: `productionToday` and `productionTotal` in kWh, based on current SEMS+ UI labels and supplied sanitized field observations.
- Metadata: `status`, `timeZone`, location coordinates/address, and provider update time where present.
- `pSystem` is deliberately not mapped because its unit has not yet been confirmed in a sanitized response fixture.
- Missing energy remains `null`; it is never converted to zero.

## PLANT_OWNER behavior

The current account role is compatible with empty `orgId`, `permissions`, and `permissionList`. Discovery validates that a role identity exists but does not require organization or permission arrays to be populated.

## Still required

A sanitized Network capture is still required for the following before those capabilities can be enabled:

- Device-list request body and response schema.
- Realtime energy-flow response, including verified W/kW units for PV, load, grid, and battery fields.
- Battery SOC and charge/discharge power fields.
- Daily, monthly, yearly, and total history request bodies, date boundaries, timezone behavior, and units.
- Alarm pagination and response schema.
- Naturally observed rate-limit headers and session-expiry response.

Remote-control, settings-write, restart, shutdown, charging-mode, firmware, and other mutation endpoints are explicitly out of scope and must never be invoked by this integration.
