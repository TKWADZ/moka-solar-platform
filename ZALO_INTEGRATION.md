# Zalo Invoice Notification Integration

This project includes a safe backend-only foundation for sending invoice notifications through Zalo OA template messaging.

## Required environment variables

Add these on the backend environment only:

- `ZALO_APP_ID`
- `ZALO_APP_SECRET`
- `ZALO_OA_ID`
- `ZALO_ACCESS_TOKEN`
- `ZALO_TEMPLATE_INVOICE_ID`
- `ZALO_TEMPLATE_REMINDER_ID`
- `ZALO_TEMPLATE_PAID_ID`
- `ZALO_API_BASE_URL`
- `ZALO_DRY_RUN`

Recommended default:

- `ZALO_API_BASE_URL=https://openapi.zalo.me/v3.0/oa`
- `ZALO_DRY_RUN=true`

## Template configuration

Template IDs are configured with these variables:

- `ZALO_TEMPLATE_INVOICE_ID`
- `ZALO_TEMPLATE_REMINDER_ID`
- `ZALO_TEMPLATE_PAID_ID`

Current admin send action uses the invoice template first. Reminder and paid templates are prepared for later workflow expansion.

## Admin send flow

1. Admin opens `/admin/billing`.
2. The page loads Zalo status and recent message logs.
3. For any billing record that already has an invoice, admin can click `Gui Zalo`.
4. Frontend calls:
   - `POST /api/zalo-notifications/invoices/:invoiceId/send`
5. Backend:
   - loads invoice, customer, monthly billing, and contract context
   - prepares template payload with safe fallbacks
   - sends a real request only when required env is configured and dry-run is disabled
   - writes a `ZaloMessageLog` row for every attempt

## Template payload variables

Current payload supports:

- `customer_name`
- `billing_month`
- `consumption_kwh`
- `amount_due`
- `due_date`
- `payment_link`
- `hotline`

If a field is missing, the service falls back to an empty string or a safe default instead of crashing.

## Local testing

### Dry-run mode

Dry-run is enabled by default unless `ZALO_DRY_RUN=false`.

This means you can test the UI and backend flow locally without sending real Zalo messages.

The service will also stay in dry-run/block mode if required env vars are missing.

### Steps

1. Run local stack:
   - `docker compose -f docker-compose.yml -f docker-compose.local.yml up --build`
2. Log in to local admin.
3. Open `/admin/billing`.
4. Click `Gui Zalo` on a billing row with an invoice.
5. Verify success feedback and inspect recent Zalo logs in the same page.

## Switching from test to real send

1. Set real OA/token/template env vars on the backend.
2. Set `ZALO_DRY_RUN=false`.
3. Restart backend.
4. Test with an internal invoice first.

## Common failure points

- Missing `ZALO_OA_ID`, `ZALO_ACCESS_TOKEN`, `ZALO_TEMPLATE_INVOICE_ID`, or `ZALO_API_BASE_URL`
- Customer phone number missing on invoice/customer profile
- Template variable names not matching the approved Zalo template
- OA token expired or incorrect
- Using dry-run mode while expecting a real provider send

## Logging

Each send attempt writes a `ZaloMessageLog` record with:

- invoice reference
- customer name
- recipient phone
- template type
- send status
- provider code/message
- request/response payload
- timestamps
