# Deploy Status

- latest task: Fix customer portal font/rendering issue by switching the display font to a Vietnamese-capable family and restoring Vietnamese labels/text on billing, overview, payments, support, systems, contracts, loading/error, toast, and status badges
- local test status: Frontend TypeScript check passed (`npx tsc --noEmit`); Vietnamese text rendering and customer copy patched locally; production font config verified locally on April 16, 2026 23:01 +07
- build status: Frontend production build passed (`npm run build`) after the font config fix
- approval requested or not: requested and approved
- approved or not: approved on April 16, 2026 23:01 +07
- deployed or not: deploying to VPS via GitHub Action after push to `main`
- rollback target if needed: revert the local customer-portal font/text patch set and redeploy the previous stable customer portal build if production shows regressions
