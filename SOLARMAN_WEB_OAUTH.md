# SOLARMAN Web OAuth refresh-token mode

## Provider mode

Use `WEB_OAUTH_REFRESH_TOKEN` for SOLARMAN Business accounts that require a human to complete Turnstile during normal browser login. The backend does not automate login, CAPTCHA, Cloudflare, or MFA and does not read browser cookies or storage.

## Admin authorization

1. Create or edit the SOLARMAN connection in `/admin/solarman`.
2. Select `Web OAuth Refresh Token` and save the connection.
3. Sign in to SOLARMAN manually in the normal browser and complete any human verification.
4. A Super Admin or Admin with `integration.secrets.manage` pastes a newly issued refresh token into `Xác thực SOLARMAN` once.
5. The browser clears the field after the request. The backend exchanges the token, encrypts the rotated token, discovers stations, and marks the connection `VERIFIED` only after station discovery succeeds.

Never place a refresh token in chat, command arguments, environment variables, logs, or files. Manager and Staff roles cannot view or submit the secret.

## Runtime behavior

- Access and refresh tokens are encrypted with AES-256-GCM at rest.
- `SOLARMAN_SETTINGS_SECRET` is required in production. `JWT_SECRET` remains a compatibility fallback for existing installations, but a dedicated secret is recommended.
- Access tokens are cached in memory and encrypted in PostgreSQL so multiple PM2 workers can reuse the same current token.
- Refresh begins before expiry. Configure the safety window with `SOLARMAN_WEB_TOKEN_REFRESH_MARGIN_MINUTES` (default `10`).
- A PostgreSQL advisory transaction lock keyed by connection ID serializes token refresh and rotation across PM2 workers.
- A rotated refresh token replaces the previous token in the same transaction. If the provider omits a new refresh token, the current encrypted token is retained.
- A rejected refresh token sets `AUTH_REQUIRED`; transient provider failures set `ERROR`. Neither path falls back to password login.
- Browser cookies, Cloudflare values, Turnstile values, and CSRF artifacts are not stored or sent.

## Discovery and billing safety

Successful authorization discovers every returned station and upserts systems by `SOLARMAN + stationId`. Repeated discovery does not create duplicates. Existing customer ownership, contracts, pricing, and billing fields are preserved. Unassigned systems remain outside customer billing, and missing production values remain null rather than being stored as zero.

## Database migration

Migration `20260808190000_solarman_web_oauth_refresh_token` adds encrypted token and refresh-status columns. It does not transform plaintext values in SQL. Compatible legacy token values are encrypted and cleared lazily under the same connection lock when the new mode first uses them.

Do not run the migration or deploy this branch until explicit approval.
