# Staff Password Recovery

This workflow applies only to `SUPER_ADMIN`, `ADMIN`, `MANAGER`, and `STAFF` accounts.
Customer phone/password and Zalo OTP flows are unchanged.

## Security model

- Internal email is normalized with `trim().toLowerCase()` before lookup.
- Passwords use bcrypt and the shared 12-128 character policy.
- Reset tokens use 32 cryptographically random bytes; only their SHA-256 hashes are stored.
- A token expires after 20 minutes, is single-use, and revokes earlier unused tokens.
- Reset revokes all sessions. Authenticated password change preserves only the current tracked session.
- Role, customer ownership, and MFA/TOTP fields are never changed by password recovery.
- Public forgot-password responses do not reveal whether an account exists.
- CLI recovery requires hidden interactive input and records `source=server_cli` in `AuditLog`.

## Local commands

```bash
git switch -c fix/staff-password-recovery
cd backend
npm install
npx prisma validate
npx prisma generate
npm run test:unit
npm run test:e2e
npm run typecheck
npm run build
cd ../frontend
npm install
npm run build
```

`npm run test:e2e` requires an isolated PostgreSQL database in `TEST_DATABASE_URL` with migrations applied.
It skips rather than touching a development or production database when that variable is absent.

## Production environment

Configure these values only in the VPS secret env file. Never commit the values:

```dotenv
APP_PUBLIC_URL=https://mokasolar.com
MAIL_FROM=
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASSWORD=
STAFF_PASSWORD_RESET_TTL_MINUTES=20
STAFF_PASSWORD_RESET_REQUEST_MAX_PER_HOUR=5
STAFF_PASSWORD_RESET_SUBMIT_MAX_PER_HOUR=10
```

## Safe PM2 deployment

Production process names are `moka-solar-backend` and `moka-solar-frontend`.

```bash
cd /var/www/mokasolar/source
timestamp="$(date +%Y%m%d-%H%M%S)"
mkdir -p "/var/www/mokasolar/shared/backups/$timestamp"

cd backend
database_url="$(node -r ./dist/src/common/helpers/bootstrap-env.js -p 'process.env.DATABASE_URL')"
pg_dump "$database_url" --format=custom --no-owner \
  --file="/var/www/mokasolar/shared/backups/$timestamp/pre-staff-password-recovery.dump"

npx prisma validate
npx prisma migrate status
sed -n '1,220p' prisma/migrations/20260808100000_add_staff_password_reset_tokens/migration.sql
npx prisma migrate deploy
npm install
npx prisma generate
npm run test:unit
npm run typecheck
npm run build

cd ../frontend
npm install
npm run build

cd ..
pm2 startOrReload /var/www/mokasolar/scripts/ecosystem.config.js --update-env
pm2 save
pm2 status moka-solar-backend moka-solar-frontend
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS http://127.0.0.1:3000/ >/dev/null
```

Do not pass a password through an argument, env variable, shell history, or package script.

## Emergency reset

Run this from a real interactive SSH terminal after the migration and build:

```bash
cd /var/www/mokasolar/source/backend
npm run admin:reset-password -- --email user@example.com
```

For an intentionally deactivated internal account only:

```bash
npm run admin:reset-password -- --email user@example.com --activate
```

Creating the first internal account is a separate operation and is refused when any internal account exists:

```bash
npm run admin:create-first -- --email owner@example.com
```

There is no MFA-reset command because this repository does not currently store a TOTP secret. Password recovery must remain separate if TOTP is added later.

## Verification

1. Open `/login?mode=staff` and verify the generic invalid-credential message.
2. Open `/portal/nhan-su/quen-mat-khau`; submit an existing and nonexistent email and compare responses.
3. Confirm SMTP delivery without inspecting application logs for the reset URL.
4. Use the reset link once, then verify that reuse and expiry are rejected identically.
5. Confirm the old password and old refresh sessions no longer work.
6. Sign in with the new password and open `/admin/security` to test authenticated password change.
7. Verify customer phone/password and Zalo OTP routes are unchanged.

## Rollback

Prefer a Git revert of the staff-auth commit, followed by backend/frontend rebuild and PM2 reload.
The new reset-token table is additive and can remain safely unused during application rollback.
Do not drop the table or restore the full database merely to roll back application code.

If a data restore is independently required, stop the app, verify the target dump, restore only into a separately reviewed database target, and obtain explicit approval first.
