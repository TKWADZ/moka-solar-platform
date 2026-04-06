# Zalo Invoice Notification Integration

## Admin location

- Zalo settings page: `/admin/zalo`
- Billing send action: `/admin/billing`

`/admin/zalo` is the place to:

- save App ID, App Secret, OA ID, Access Token
- save API Base URL
- save template IDs for invoice, reminder, paid
- test connection with a phone number
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
- `ZALO_TEMPLATE_INVOICE_ID`
- `ZALO_TEMPLATE_REMINDER_ID`
- `ZALO_TEMPLATE_PAID_ID`
- `ZALO_API_BASE_URL`
- `ZALO_DRY_RUN`
- `ZALO_SETTINGS_SECRET`

Recommended defaults:

- `ZALO_API_BASE_URL=https://openapi.zalo.me/v3.0/oa`
- `ZALO_DRY_RUN=true`

Notes:

- Secrets are never exposed to the browser.
- App Secret and Access Token are encrypted before being stored in the database.
- If a value is saved in admin, backend will use it first.
- If admin storage is empty, backend can still fall back to env values.

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

## Switching from test to real send

1. Add real OA/token/template values.
2. Set `ZALO_DRY_RUN=false`.
3. Restart backend.
4. Test with one internal invoice first.

## Common failure points

- Missing `ZALO_OA_ID`
- Missing `ZALO_ACCESS_TOKEN`
- Missing `ZALO_TEMPLATE_INVOICE_ID`
- Wrong `ZALO_API_BASE_URL`
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
