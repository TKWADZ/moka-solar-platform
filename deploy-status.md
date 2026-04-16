# Deploy Status

- latest task: Patch customer billing continuity fallback so `Chỉ số cũ / Chỉ số mới` no longer render placeholder `0/0`, and display `Chiết khấu` as `%` on customer billing cards
- local test status: Frontend build passed; local smoke routes `/customer`, `/customer/billing`, and `/customer/meters` returned `200` after wiring shared continuity lookup into customer billing, dashboard, meter history, and invoice detail cards; discount label now renders from `discountAmount / subtotalAmount` when subtotal exists
- build status: Passed (`frontend: npm run build`)
- approval requested or not: requested and approved for VPS deployment
- approved or not: yes
- deployed or not: deployment is being prepared from this customer continuity and discount patch revision and will be verified after push
- rollback target if needed: leave current production unchanged; if this customer continuity/discount patch is deployed later and regresses, redeploy the previous stable `main` revision before this frontend-only patch
