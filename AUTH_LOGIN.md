# Authentication Login Guide

This document describes the current authentication split for Moka Solar.

## Login overview

### Customer portal

Customer daily login now uses phone number + password.

- Login field: `Số điện thoại`
- Daily login method: `Phone + password`
- Zalo OTP is used only for:
  - account registration
  - forgot password
  - phone verification
  - suspicious login or sensitive actions

Supported customer endpoints:

- `POST /api/auth/login`
- `POST /api/auth/register-otp/request`
- `POST /api/auth/register-otp/verify`
- `POST /api/auth/password-reset/request`
- `POST /api/auth/password-reset/verify`

Reserved OTP step-up endpoints:

- `POST /api/auth/login-otp/request`
- `POST /api/auth/login-otp/verify`

### Admin / Manager / Staff / Super Admin

Internal users stay on a separate auth flow:

- Login field: `Email`
- Method: `Email + password`
- Future-ready for: `TOTP / 2FA`

Supported endpoint:

- `POST /api/auth/login`
- `POST /api/auth/staff/password-reset/request`
- `POST /api/auth/staff/password-reset/verify`
- `POST /api/auth/staff/change-password` (authenticated internal session)

Staff password recovery uses the work email to locate the internal account, then sends a Zalo OTP
to its registered Vietnamese phone number. It has a dedicated `STAFF_PASSWORD_RESET` purpose and
never accepts customer OTP requests. The public request response does not reveal whether the email
exists or whether a phone is registered. Successful reset revokes every active session without
changing the role or MFA configuration.

The legacy email-link endpoints remain available only when
`STAFF_PASSWORD_RECOVERY_EMAIL_ENABLED=true`. They are disabled by default until transactional
email is configured and approved.

Emergency recovery on the application server:

```bash
cd /var/www/mokasolar/source/backend
npm run admin:reset-password -- --email user@example.com
```

The command requires an interactive TTY and reads the new password twice without echoing it.
It never creates a missing account. Use `--activate` only after explicit authorization for an inactive account.

## Main flows

### 1. Register with phone -> verify OTP -> set password

1. Call `POST /api/auth/register-otp/request`
2. Receive Zalo OTP request metadata
3. Call `POST /api/auth/register-otp/verify` with:
   - `phone`
   - `requestId`
   - `otpCode`
   - `password`
4. Backend creates customer account, marks `phoneVerifiedAt`, and creates session/JWT

### 2. Login with phone + password

1. Call `POST /api/auth/login`
2. Send:
   - `identifier` = normalized Vietnamese phone number or raw phone input
   - `password`
3. Backend detects `PHONE` automatically
4. Backend creates tracked session and JWT

### 3. Forgot password with phone -> OTP -> reset password

1. Call `POST /api/auth/password-reset/request`
2. Receive Zalo OTP request metadata
3. Call `POST /api/auth/password-reset/verify` with:
   - `phone`
   - `requestId`
   - `otpCode`
   - `password`
4. Backend resets password, revokes active sessions, verifies phone if needed, and creates a fresh session/JWT

### 4. Internal password recovery with email -> Zalo OTP -> reset password

1. Call `POST /api/auth/staff/password-reset/request` with `email`
2. Receive generic challenge metadata without a phone/account existence disclosure
3. Call `POST /api/auth/staff/password-reset/verify` with:
   - `email`
   - `requestId`
   - `otpCode`
   - `newPassword`
   - `confirmPassword`
4. Backend verifies an internal-role-only OTP, updates the password, and revokes all sessions

## Password security

- Passwords are hashed with `bcrypt`
- OTP codes are hashed with `bcrypt`
- Raw OTP codes are never stored in plaintext in the database

## User identifiers

Each user can store both:

- `email`
- `phone`

Rules:

- `email` is unique when present
- `phone` is unique when present
- Vietnamese phone numbers are normalized before save and before lookup

Examples:

- `0912345678` -> `84912345678`
- `+84912345678` -> `84912345678`
- `84 912 345 678` -> `84912345678`

## OTP storage

OTP requests are stored in `otp_requests` via Prisma model `OtpRequest`.

Stored fields include:

- hashed OTP (`codeHash`)
- purpose
- phone
- email / full name snapshot when needed
- IP / user agent
- resend cooldown timestamp
- verify attempt count
- provider send status
- request payload
- provider response payload

## Login rate limiting and lockout

Password logins are protected by:

- identifier-based rate limiting
- IP-based rate limiting
- account lockout after repeated failed password attempts

Recommended env vars:

- `AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES`
- `AUTH_LOGIN_RATE_LIMIT_IDENTIFIER_MAX`
- `AUTH_LOGIN_RATE_LIMIT_IP_MAX`
- `AUTH_LOGIN_LOCKOUT_THRESHOLD`
- `AUTH_LOGIN_LOCKOUT_MINUTES`

## Device and session tracking

Sessions are tracked in `AuthSession`.

Tracked fields include:

- auth method
- identifier type
- IP address
- user agent
- derived device label
- refresh token hash
- last seen time
- revoke state

Failed and successful login attempts are tracked in `AuthLoginAttempt`.

## OTP provider abstraction

The backend uses:

- `OtpProvider` interface
- `ZaloOtpProvider` implementation

Current provider behavior:

- secrets stay backend-only
- Zalo credentials are read from the secure Zalo config module
- local debug mode can dry-run the send and return a `debugCode`

## Required env vars

General auth:

- `JWT_SECRET`
- `AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES`
- `AUTH_LOGIN_RATE_LIMIT_IDENTIFIER_MAX`
- `AUTH_LOGIN_RATE_LIMIT_IP_MAX`
- `AUTH_LOGIN_LOCKOUT_THRESHOLD`
- `AUTH_LOGIN_LOCKOUT_MINUTES`

Staff password recovery:

- `STAFF_PASSWORD_RECOVERY_EMAIL_ENABLED=false`
- `STAFF_PASSWORD_RESET_REQUEST_MAX_PER_HOUR`
- `STAFF_PASSWORD_RESET_SUBMIT_MAX_PER_HOUR`

Legacy email-link recovery, only when explicitly enabled later:

- `APP_PUBLIC_URL`
- `MAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `STAFF_PASSWORD_RESET_TTL_MINUTES`

OTP:

- `AUTH_OTP_TTL_MINUTES`
- `AUTH_OTP_MAX_ATTEMPTS`
- `AUTH_OTP_DEBUG_MODE`
- `AUTH_OTP_RESEND_COOLDOWN_SECONDS`
- `AUTH_OTP_RATE_LIMIT_PHONE_WINDOW_MINUTES`
- `AUTH_OTP_RATE_LIMIT_PHONE_MAX`
- `AUTH_OTP_RATE_LIMIT_IP_WINDOW_MINUTES`
- `AUTH_OTP_RATE_LIMIT_IP_MAX`

Zalo OTP:

- `ZALO_APP_ID`
- `ZALO_APP_SECRET`
- `ZALO_OA_ID`
- `ZALO_ACCESS_TOKEN`
- `ZALO_REFRESH_TOKEN`
- `ZALO_API_BASE_URL`
- `ZALO_TEMPLATE_OTP_ID`

Public auth UI:

- `NEXT_PUBLIC_ENABLE_SELF_REGISTER=true`

## Admin configuration

Zalo settings are managed in admin:

- `/admin/zalo`

Required OTP-related settings:

- `App ID`
- `App Secret`
- `OA ID`
- `Access Token`
- `Refresh Token`
- `API Base URL`
- `Template ID OTP`

## Local testing

Recommended local-safe setup:

- `AUTH_OTP_DEBUG_MODE=true`

Then verify:

1. Customer login page uses `Số điện thoại + mật khẩu`
2. Customer register page uses OTP only for verification
3. Customer forgot password page uses OTP only for reset
4. Internal login page uses email + password
5. Internal forgot-password page uses email lookup + Zalo OTP
6. Backend and frontend `npm run build` both pass
