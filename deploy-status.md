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
- deployed or not: yes; production commit `248bf6d5292c1cd663289dabb38e9572b85d6c36` deployed successfully by Actions run `31225055689`
- production verification: Passed homepage, API health, staff login, and staff forgot-password route with HTTP 200; the forgot-password page contains the Zalo OTP flow and no longer contains the legacy email-link copy; HTTP and `www` redirect to the canonical HTTPS domain with HTTP 301
- production runtime: PostgreSQL reports `up`; migration `20260808113000_add_staff_password_reset_otp_purpose` applied successfully; PM2 backend/frontend remained online for the workflow's 5-minute stability window with zero restarts; PM2 state was saved for reboot recovery
- production backup: The guarded workflow created and validated a PostgreSQL backup before migration and preserved the prior production release as the rollback target
- production prerequisites: each internal account needs a valid registered Vietnamese phone; production Zalo OTP template/token configuration must be available; `AUTH_OTP_DEBUG_MODE` must remain `false`
- deploy command used after explicit approval: `git push origin HEAD:main`
- remaining live check: A real OTP was not intentionally sent during smoke testing; successful delivery requires the selected internal account to have a registered Vietnamese phone and valid production Zalo OA/token/template configuration
- rollback target if needed: previous production commit `0d7c8c90a416dd1664e51d941fa140b63a1ac8e9`; the additive OTP enum value may remain unused after code rollback
