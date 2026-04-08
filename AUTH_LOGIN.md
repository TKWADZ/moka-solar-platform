# Authentication Login Guide

This document describes the current authentication split for Moka Solar.

## Login overview

### Customer portal

Customer login is phone-first and OTP-first.

- Login field: `Số điện thoại`
- Channel: `Zalo OTP`
- OTP length: `6 digits`
- OTP TTL: `5 minutes` by default
- Resend cooldown: `60 seconds` by default
- Max verify attempts per OTP request: `5`

Supported endpoints:

- `POST /api/auth/login-otp/request`
- `POST /api/auth/login-otp/verify`
- `POST /api/auth/register-otp/request`
- `POST /api/auth/register-otp/verify`

### Admin / Manager / Staff / Super Admin

Internal users stay on a separate auth flow:

- Login field: `Email`
- Method: `Email + password`
- Future-ready for: `TOTP / 2FA`

Supported endpoint:

- `POST /api/auth/login`

## Data model

### User identifiers

Each user can store both:

- `email`
- `phone`

Rules:

- `email` is unique when present
- `phone` is unique when present
- customer phone is normalized before lookup and before save

Examples:

- `0912345678` -> `84912345678`
- `+84912345678` -> `84912345678`
- `84 912 345 678` -> `84912345678`

### Phone verification

On successful customer OTP verification:

- `user.phoneVerifiedAt` is set
- JWT session is created immediately

## OTP storage

OTP requests are stored in `otp_requests` via Prisma model `OtpRequest`.

Stored fields include:

- hashed OTP (`codeHash`)
- purpose (`CUSTOMER_LOGIN` or `CUSTOMER_REGISTER`)
- phone
- IP / user agent
- resend cooldown timestamp
- verify attempt count
- provider send status
- request payload
- provider response payload

Raw OTP codes are never stored in plaintext in the database.

## OTP provider abstraction

The backend uses:

- `OtpProvider` interface
- `ZaloOtpProvider` implementation

Current provider behavior:

- secrets stay backend-only
- Zalo credentials are read from the secure Zalo config module
- local debug mode can dry-run the send and return a `debugCode`

## Required env vars

General OTP:

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

## Admin configuration

Zalo settings are managed in admin:

- `/admin/zalo`

Recommended configured fields for OTP:

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

1. Customer login page only asks for phone + OTP.
2. Internal login page uses email + password.
3. `POST /api/auth/login-otp/request` returns `requestId`, `expiresAt`, `resendAvailableAt`.
4. `POST /api/auth/login-otp/verify` creates a valid customer session.
5. `POST /api/auth/register-otp/request` creates a register OTP request.
6. `POST /api/auth/register-otp/verify` creates a customer account and session.
7. Backend and frontend `npm run build` both pass.
