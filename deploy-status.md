# Deploy Status

- latest task: Fix remaining customer-portal mojibake and non-accented Vietnamese strings in the live shell/header, notifications panel, install-app card, and daily consumption copy after the previous font deploy
- local test status: Frontend production build passed (`npm run build`); portal shell, install card, and consumption text patched locally; this follow-up fix has not been redeployed yet
- build status: Frontend production build passed (`npm run build`) after the mojibake cleanup
- approval requested or not: requested in this update
- approved or not: not yet
- deployed or not: not deployed; waiting for explicit VPS deployment approval for the follow-up text cleanup
- rollback target if needed: keep current production, or if this follow-up deploy regresses, revert only the mojibake cleanup commit and redeploy the prior successful font-fix revision
