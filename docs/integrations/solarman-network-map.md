# SOLARMAN read-only network map

## Capture status

This map was prepared on 2026-08-08 from the current first-party SOLARMAN Business bundle loaded by the authorized browser page and from the repository's existing official OpenAPI implementation. No password, AppSecret, cookie, access token, refresh token, browser storage value, authorization value, or raw HAR file was read or stored.

The browser tooling did not expose request/response event bodies. URLs and methods below are verified from the current first-party bundle. Unknown request fields, response fields, and units are not treated as verified.

## Provider modes

| Mode | Base | Status |
| --- | --- | --- |
| Official OpenAPI | `https://globalapi.solarmanpv.com` | Existing implementation preserved and preferred whenever App ID/App Secret are configured |
| Business web fallback | `https://home.solarmanpv.com` | Default origin and device-list endpoint updated to the current first-party bundle |
| Manual import | Local file/import flow | Preserved |

## Existing official OpenAPI contract

| Purpose | Method | Path |
| --- | --- | --- |
| Access token | POST | `/account/v1.0/token?appId=<APP_ID>&language=en` |
| Station list | POST | `/station/v1.0/list` |
| Station devices | POST | `/station/v1.0/device` |
| Station history | POST | `/station/v1.0/history` |

The official token request sends a SHA-256 password hash, keeps AppSecret server-side, and uses a bearer authorization header for subsequent calls. This behavior was not rewritten.

## Current Business web requests verified from the first-party bundle

| Purpose | Method | Path |
| --- | --- | --- |
| Login/token | POST form | `/oauth2-s/oauth/token` |
| Refresh token | POST form | `/oauth2-s/oauth/token` |
| Current account | GET | `/user-s/acc/org/login-user` |
| Role functions | GET | `/auth-s/auth/role/{role}/function` |
| Role detail | GET | `/auth-s/auth/role/{role}` |
| Logout | POST | `/oauth2-s/oauth/logout` |
| Station list | POST | `/maintain-s/operating/station/search` |
| Fast station overview | GET | `/maintain-s/fast/system/{stationId}` |
| Station information | GET | `/maintain-s/operating/station/information/{stationId}` |
| Station | GET | `/maintain-s/station/{stationId}` |
| Station detail | GET | `/maintain-s/station/{stationId}/detail` |
| Device list | POST | `/maintain-s/power/system/deviceList` |
| Collector list | GET | `/maintain-s/operating/station/{stationId}/collector` |
| Operating system | GET | `/maintain-s/operating/system/{systemId}` |
| Power record | GET | `/maintain-s/history/power/{stationId}/record` |
| Power statistics | GET | `/maintain-s/history/power/{stationId}/stats/{type}` |
| Power analysis | GET | `/maintain-s/history/power/analysis/{id}/{type}` |
| Battery statistics | GET | `/maintain-s/history/batteryPower/{stationId}/stats/{type}` |
| Battery tree | GET | `/maintain-s/operating/station/{stationId}/battery/tree` |
| Alarm search | POST | `/maintain-s/operating/alert/search` |
| Alarm detail | POST | `/maintain-s/operating/alert/detail` |
| Alarm timeline | POST | `/maintain-s/operating/alert/timeline` |

## Session behavior

- Normal requests reuse the existing server-side provider session/token cache.
- A 401/403/session-expiry response invalidates the cached session and allows exactly one re-authentication attempt.
- A second rejection is returned as a provider error; no infinite retry loop exists.
- Official OpenAPI remains the preferred mode when its credentials are configured.
- Provider credentials and session artifacts are never returned by the unified Systems discovery API.

## Still required

Before changing the existing history mapping or enabling additional Business web fields, capture sanitized request and response examples for:

- Station search and device-list request bodies and pagination.
- Realtime PV/load/grid/battery response fields and verified units.
- Daily/monthly/yearly history query values, date formats, timezone behavior, and response units.
- Alarm pagination and provider error schema.
- Naturally observed access-token expiry and refresh response fields.

The integration must not replay browser requests or persist cookies from the interactive browser session. Remote-control and write endpoints are out of scope.
