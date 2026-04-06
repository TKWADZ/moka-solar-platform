# Zalo Invoice Notification Integration

## Admin location

- Zalo settings page: `/admin/zalo`
- Billing send action: `/admin/billing`

`/admin/zalo` is the place to:

- save App ID, App Secret, OA ID, Access Token
- save Refresh Token
- save API Base URL
- save template IDs for invoice, reminder, paid
- test connection with a phone number
- review token diagnostics and auto-refresh status
- review recent send logs

`/admin/billing` is the place to:

- click `Gui Zalo` for a specific invoice
- see send status without leaving the billing workflow

## Required config

Add these variables on the backend only:

- `ZALO_APP_ID`
- `ZALO_APP_SECRET`
- `ZALO_OA_ID`
- `ZALO_ACCESS_TOKEN`
- `ZALO_REFRESH_TOKEN`
- `ZALO_TEMPLATE_INVOICE_ID`
- `ZALO_TEMPLATE_REMINDER_ID`
- `ZALO_TEMPLATE_PAID_ID`
- `ZALO_API_BASE_URL`
- `ZALO_OAUTH_BASE_URL`
- `ZALO_DRY_RUN`
- `ZALO_SETTINGS_SECRET`

Recommended defaults:

- `ZALO_API_BASE_URL=https://openapi.zalo.me/v3.0/oa`
- `ZALO_OAUTH_BASE_URL=https://oauth.zaloapp.com/v4/oa`
- Local / staging: `ZALO_DRY_RUN=true`
- Production gui that: `ZALO_DRY_RUN=false`

Notes:

- Secrets are never exposed to the browser.
- App Secret, Access Token and Refresh Token are encrypted before being stored in the database.
- Backend uses `database first, env fallback` for Zalo settings.
- Admin diagnostics show which source is currently being used for access token and refresh token.
- If env is present but database already has a value, diagnostics show that env is shadowed.

## Token handling

- `Access Token` is used for template send requests.
- `Refresh Token` is optional but recommended.
- When Zalo rejects the current access token and refresh prerequisites exist, backend will:
  1. call the OAuth refresh endpoint server-side
  2. obtain a new access token
  3. store the new token safely if the integration is using database-backed settings
  4. retry the failed send once
- If the integration is env-only, backend can still refresh in memory for the current request, but it will not overwrite `.env` automatically.
- Admin diagnostics show:
  - access token source
  - refresh token source
  - token state (`AVAILABLE`, `EXPIRED`, `REJECTED`, `MISSING`)
  - whether auto-refresh is enabled
  - whether refreshed tokens can be persisted back to database

## What the backend sends

Current invoice template payload supports:

- `customer_name`
- `billing_month`
- `consumption_kwh`
- `amount_due`
- `due_date`
- `payment_link`
- `hotline`

Safe fallbacks are used when any field is missing so the action does not crash.

## Local testing

### Safe test mode

Local testing is meant to stay safe by default.

- If required config is missing, backend returns a blocked or dry-run result with exact missing fields.
- If `ZALO_DRY_RUN=true`, backend will log the attempt without sending a real message.
- If Zalo credentials are incomplete, `/admin/zalo` will show which field is missing and whether refresh can be used as fallback.

### Steps

1. Run local stack:
   - `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`
2. Log in to local admin.
3. Open `/admin/zalo`.
4. Save settings if needed.
5. Enter a test phone number and click `Test ket noi Zalo`.
6. Open `/admin/billing`.
7. Click `Gui Zalo` on an invoice.
8. Review recent logs on `/admin/zalo` or in the billing page Zalo panel.
9. If provider reports token invalid, check token diagnostics and `Lan refresh gan nhat` on `/admin/zalo`.

## Switching from test to real send

1. Add real OA/token/template values.
2. Add a real Refresh Token if available so access token can rotate automatically.
3. Set `ZALO_DRY_RUN=false`.
4. Restart backend.
5. Test with one internal invoice first.

## Common failure points

- Missing `ZALO_OA_ID`
- Missing `ZALO_ACCESS_TOKEN`
- Missing `ZALO_REFRESH_TOKEN` when you expect auto-refresh
- Missing `ZALO_TEMPLATE_INVOICE_ID`
- Wrong `ZALO_API_BASE_URL`
- Wrong `ZALO_OAUTH_BASE_URL`
- Customer phone number missing on the invoice/customer profile
- Template variable names not matching the approved Zalo template
- OA token expired or revoked
- `ZALO_DRY_RUN=true` while expecting a real send

## Logging

Each send attempt writes a `ZaloMessageLog` record with:

- message type
- invoice id when available
- customer name
- recipient phone
- template id
- status
- provider response code/message
- timestamp
