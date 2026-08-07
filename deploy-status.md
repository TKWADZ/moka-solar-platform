# Deploy Status

- latest task: Staff/Admin login recovery, secure CLI reset, forgot/reset password, and authenticated change-password
- local test status: Passed backend unit tests (5/5), typecheck, Prisma validation/generation, and browser checks for staff login/forgot/reset routes; customer phone normalization regression test passed
- build status: Passed (`backend: npm run build`, `frontend: npm run build`)
- approval requested or not: yes; final deployment summary was presented
- approved or not: yes; user approved VPS deployment
- deployed or not: yes; production commit `5362594b615fb298b10e3849b45cf82576f3d893` deployed successfully by Actions run `31220442630`
- production verification: Passed homepage, public pages, staff login, forgot/reset password, admin security, Next.js asset, redirects, API health, and 5-minute PM2 stability checks; PostgreSQL reports `up`
- remaining checks: staff recovery e2e suite safely skipped because no isolated `TEST_DATABASE_URL`/PostgreSQL is available; real email delivery requires VPS SMTP configuration
- dependency warning: Nodemailer was upgraded to the patched 9.0.5 release; pre-existing Nest/Express/XLSX/native dependency advisories remain outside this focused change and must not be force-upgraded during auth recovery
- rollback target if needed: production commit `08702f88fb4dd1c30a94b4667b5e1b1d03a18191`; the additive reset-token table may remain unused during code rollback
