# Deploy Status

- latest task: Full mobile customer portal self-review and UX polish across overview, meters, billing, payments, support, contracts, loading/error, theme states, toast, and status badges
- local test status: Frontend TypeScript check passed (`npx tsc --noEmit`); customer portal theme/mobile UX patched locally; no frontend build blocker found
- build status: Frontend production build passed (`npm run build`)
- approval requested or not: requested and approved by user
- approved or not: approved
- deployed or not: deploying via GitHub Action on push to `main`
- rollback target if needed: revert the upcoming customer-portal mobile polish commit on `main`, then let the existing GitHub Action redeploy the previous stable revision
