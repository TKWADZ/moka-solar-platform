# Staff Password Recovery

This workflow applies to `SUPER_ADMIN`, `ADMIN`, `MANAGER`, and `STAFF` accounts.
Daily internal login remains email plus password. Password recovery uses Zalo OTP.

## Active recovery flow

1. The operator opens `/portal/nhan-su/quen-mat-khau` and enters the work email.
2. The backend returns generic challenge metadata, whether or not the account exists.
3. For an active internal account with a registered Vietnamese phone, the backend sends a six-digit
   OTP through the configured Zalo OTP template.
4. The operator submits email, challenge ID, OTP, new password, and confirmation.
5. A successful reset revokes all existing sessions and legacy reset links.

API endpoints:

- `POST /api/auth/staff/password-reset/request`
- `POST /api/auth/staff/password-reset/verify`

The old email-link endpoints are retained for a future transactional-email rollout, but are disabled
unless `STAFF_PASSWORD_RECOVERY_EMAIL_ENABLED=true`.

## Security model

- Work email is normalized before lookup.
- Public responses do not disclose account or phone existence.
- Internal roles and customer OTP purposes are kept separate.
- OTP has six digits, expires after five minutes by default, and is stored only as a bcrypt hash.
- Resend cooldown defaults to 60 seconds and verification is blocked after five failed attempts.
- Requests are rate-limited by email, registered phone, and IP.
- OTP and token fields are redacted from provider payloads stored by the staff challenge flow.
- Passwords use bcrypt and the shared 12 to 128 character policy.
- Successful recovery revokes all sessions and writes security audit records.
- An internal account must have a valid registered Vietnamese phone number.

## Required configuration

Configure Zalo credentials only in the secure VPS settings/env. Never commit real values:

```dotenv
AUTH_OTP_TTL_MINUTES=5
AUTH_OTP_MAX_ATTEMPTS=5
AUTH_OTP_DEBUG_MODE=false
AUTH_OTP_RESEND_COOLDOWN_SECONDS=60
AUTH_OTP_RATE_LIMIT_PHONE_WINDOW_MINUTES=15
AUTH_OTP_RATE_LIMIT_PHONE_MAX=5
AUTH_OTP_RATE_LIMIT_IP_WINDOW_MINUTES=15
AUTH_OTP_RATE_LIMIT_IP_MAX=20
STAFF_PASSWORD_RESET_REQUEST_MAX_PER_HOUR=5
STAFF_PASSWORD_RESET_SUBMIT_MAX_PER_HOUR=10
STAFF_PASSWORD_RECOVERY_EMAIL_ENABLED=false
ZALO_TEMPLATE_OTP_ID=
```

The remaining Zalo app/OA credentials are resolved through the existing backend-only Zalo settings
service. The staff flow uses the same approved OTP template and token-refresh path as customer OTP.

## Local verification

Use dry-run only outside production:

```dotenv
AUTH_OTP_DEBUG_MODE=true
```

Then run:

```bash
cd backend
npx prisma validate
npx prisma generate
npm run test:unit
npm run test:e2e
npm run typecheck
npm run build

cd ../frontend
npx tsc --noEmit
npm run build
```

`npm run test:e2e` requires an isolated migrated PostgreSQL database in `TEST_DATABASE_URL`. It skips
instead of touching a development or production database when that variable is absent.

## Production migration

The additive migration is:

`backend/prisma/migrations/20260808113000_add_staff_password_reset_otp_purpose/migration.sql`

Back up PostgreSQL before `npx prisma migrate deploy`. Do not drop the existing
`StaffPasswordResetToken` table; it remains available for the future email channel.

## Emergency recovery

If an internal account has no usable registered phone or Zalo is unavailable, use the existing
interactive server command from a trusted SSH session:

```bash
cd /var/www/mokasolar/source/backend
npm run admin:reset-password -- --email user@example.com
```

The command reads the password without echoing it and writes an audit event. It does not create a
missing account.

## Verification checklist

1. Request OTP for each internal role and confirm the Zalo OTP template is used.
2. Compare public responses for existing and nonexistent emails.
3. Confirm wrong OTP attempts increment and the sixth attempt cannot proceed after the five-attempt cap.
4. Confirm resend is blocked for 60 seconds and OTP expires after five minutes.
5. Confirm the old password and all old refresh sessions fail after a successful reset.
6. Confirm customer password reset still accepts only `CUSTOMER_PASSWORD_RESET` challenges.
7. Confirm no raw OTP appears in `OtpRequest`, Zalo message logs, application logs, or audit payloads.

## Rollback

Revert the application commit, rebuild backend/frontend, and reload the approved production process.
The enum value and existing reset-token table are additive and can remain unused. Do not drop a table,
delete a volume, or restore the whole database merely to roll back this feature.
