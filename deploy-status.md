# Deploy Status

- latest task: Fix customer continuity source selection so meter history and billing cards prefer billed PV/billable kWh over `loadConsumedKwh`, preventing `0 -> 0` chains on import periods and wrong readings like `0 -> 861,2` when the bill is based on PV
- local test status: Frontend build passed; local smoke routes `/customer`, `/customer/billing`, and `/customer/meters` returned `200` after changing continuity source priority to `billable -> PV -> load`
- build status: Passed (`frontend: npm run build`)
- approval requested or not: requested and approved for VPS deployment
- approved or not: yes
- deployed or not: deployment is being prepared from this continuity-source priority patch and will be verified after push
- rollback target if needed: leave current production unchanged; if this customer continuity/discount patch is deployed later and regresses, redeploy the previous stable `main` revision before this frontend-only patch
