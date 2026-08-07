# Deploy Status

- latest task: Replace staff email-link recovery with Zalo OTP for `SUPER_ADMIN`, `ADMIN`, `MANAGER`, and `STAFF`
- local test status: Passed isolated PostgreSQL e2e for all four internal roles, wrong/correct OTP handling, password reset, session revocation, customer auth regression, and raw OTP/token redaction; local page returned HTTP 200 and passed a 390px browser layout/console check
- localhost URL checked: `http://127.0.0.1:3100/portal/nhan-su/quen-mat-khau` (port 3000 was already occupied by an unrelated local process; the project default remains port 3000)
- typecheck status: Passed backend `npm run typecheck` and frontend `npx tsc --noEmit`
- unit test status: Passed 5/5
- e2e status: Passed 1/1 against an isolated temporary PostgreSQL container; the container and its non-persistent data were removed after testing
- Prisma status: Schema valid; all 35 migrations, including `20260808113000_add_staff_password_reset_otp_purpose`, applied successfully to the isolated test database
- build status: Passed backend `npm run build` and frontend `npm run build`
- approval requested or not: yes
- approved or not: yes
- deployed or not: pending
- production prerequisites: each internal account needs a valid registered Vietnamese phone; production Zalo OTP template/token configuration must be available; `AUTH_OTP_DEBUG_MODE` must remain `false`
- deploy command after explicit approval: commit the reviewed changes, then `git push origin HEAD:main` to trigger the guarded GitHub Actions production workflow
- rollback target if needed: current production commit `5362594b615fb298b10e3849b45cf82576f3d893`; the additive OTP enum value may remain unused after code rollback
