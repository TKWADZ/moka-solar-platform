# Deploy Status

- latest task: Customer portal mobile UI update for bottom tab contrast, theme switch, and editable customer profile
- local test status: TypeScript check passed for frontend (`npm exec tsc -- --noEmit`); shared customer theme/profile flow patched locally; Prisma migrate deploy blocked locally because `DATABASE_URL` is not set
- build status: Backend build passed; frontend production build passed
- approval requested or not: requested and approved by user
- approved or not: approved
- deployed or not: deploying via GitHub Action on push to `main`
- rollback target if needed: revert this deployment commit on `main`, then let the existing VPS GitHub Action redeploy the previous stable revision
