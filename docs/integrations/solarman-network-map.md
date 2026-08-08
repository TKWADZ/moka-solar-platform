# SOLARMAN read-only network map

## Capture status

This map was prepared on 2026-08-08 from the current first-party SOLARMAN Business bundle loaded by the authorized browser page and from the repository's existing official OpenAPI implementation. No password, AppSecret, cookie, access token, refresh token, browser storage value, authorization value, or raw HAR file was read or stored.

The browser tooling did not expose request/response event bodies. URLs and methods below are verified from the current first-party bundle. Unknown request fields, response fields, and units are not treated as verified.

## Provider modes

| Mode | Base | Status |
| --- | --- | --- |
| Official OpenAPI | `https://globalapi.solarmanpv.com` | Existing implementation preserved and preferred whenever App ID/App Secret are configured |
| Business web fallback | `https://home.solarmanpv.com` | Manual authorization boundary; unattended refresh is not enabled |
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

### Verified request shapes

- Station search sends an empty JSON object and query parameters `order.direction=DESC`, `order.property=id`, `page`, and `size`. The response exposes `total` and `data`.
- Device list sends `order.direction=ASC`, `order.property=device_id`, and `stationId`. The response exposes `total` and `data`.
- Daily aggregate history uses `GET /maintain-s/history/power/{stationId}/stats/month` with `year` and `month` query parameters.
- Monthly aggregate history uses `GET /maintain-s/history/power/{stationId}/stats/year` with a `year` query parameter.
- Realtime day records use `GET /maintain-s/history/power/{stationId}/record` with `year`, `month`, and `day`; this endpoint is not used as billing history.
- Aggregate response fields verified from the first-party renderer are `generationValue`, `useValue`, `gridValue`, `buyValue`, `chargeValue`, and `dischargeValue`; their chart unit is kWh.
- Realtime response fields include `generationPower`, `usePower`, `gridPower`, `buyPower`, `batterySoc`, `chargePower`, `dischargePower`, and `dateTime`; power values are rendered as W-to-kW conversions and are not used for monthly billing.

### Refresh contract visible in the first-party bundle

The frontend calls POST `/oauth2-s/oauth/token` as `application/x-www-form-urlencoded` with these field names only:

- `grant_type=refresh_token`
- `refresh_token`
- `client_id=test`
- `system`
- `area`
- `origin_id` (empty is supported by the client code when no visitor ID is present)

It reads `access_token` and an optional rotated `refresh_token`, refreshes before expiry, and sends normal API requests with `Authorization: Bearer ...`. No token value or browser storage value was read during this audit.

## Session behavior

- Official OpenAPI requests reuse the server-side token cache and may re-authenticate exactly once after a recoverable 401/403.
- Legacy Business web requests may reuse an already-persisted session, but the backend never submits the account password to the web OAuth endpoint.
- HTTP 401/403/412 in Business web mode stops immediately with `AUTH_REQUIRED`; there is no password retry loop.
- HTTP 412 response content is not copied into provider logs.
- Official OpenAPI remains the preferred mode when its credentials are configured.
- Provider credentials, token previews, and session artifacts are never returned by frontend APIs.

## Decision status

The account-level local decision test succeeded without browser cookies:

- Refresh response: HTTP 200 with an access token and a rotated refresh token.
- Station search with the refreshed bearer token: HTTP 200 with four station rows and the expected plant match.
- The token used by the local probe was treated as consumed and was not retained or committed.
- VPS egress and station discovery: not yet proven.
- Selected unattended provider mode: none. `WEB_OAUTH_REFRESH_TOKEN` was not implemented.

Until the VPS check also passes, the safe production modes remain Official OpenAPI, legacy compatibility, and manual import.

### Safe decision-test command

After the operator manually logs in and completes Turnstile in an isolated browser profile, run:

```bash
cd backend
npm run solarman:test-refresh-decision
```

The command asks for the refresh token through a hidden interactive prompt. It never accepts the token as a CLI argument or environment variable, never writes it to disk, never prints it, and sends no Cookie header. It then asks for an optional plant-name marker, performs the verified refresh grant, and performs the verified station-search request. Output is limited to HTTP status, token-presence booleans, station count, plant-match boolean, and the Outcome 1 decision.

For an operator-controlled proof, pass the non-secret plant marker explicitly so the refresh token remains the only interactive input: `npm run solarman:test-refresh-decision -- --expected-plant-marker=VP`.

On Windows, run the command in Windows Terminal or a standard PowerShell console. Paste into the hidden prompt with Ctrl+Shift+V, right-click paste, or Shift+Insert. Windows PowerShell ISE is unsupported because it does not provide the raw interactive TTY required by the hidden prompt.

Run the same command directly on the VPS to prove the VPS egress path. Do not paste the token into shell history, chat, logs, `.env`, or a GitHub secret. This command is a decision test only; it does not enable a provider mode or save credentials.

## Still required

Before changing the existing history mapping or enabling additional Business web fields, capture sanitized request and response examples for:

- Sanitized account/station/device/history response examples for parser regression fixtures.
- Confirmed timezone semantics for aggregate day/month boundaries.
- Alarm pagination and provider error schema.
- An isolated VPS decision test using a newly issued refresh token entered only through hidden TTY.

The integration must not replay browser requests or persist cookies from the interactive browser session. Remote-control and write endpoints are out of scope.
