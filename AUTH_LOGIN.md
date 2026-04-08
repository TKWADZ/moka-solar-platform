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

## Customer OTP storage

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
5. Backend and frontend `npm run build` both pass
