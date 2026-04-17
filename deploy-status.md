# Deploy Status

- latest task: Fix customer billing UI mapping so "Hóa đơn gần đây" uses the same corrected meter readings as "Lịch sử chỉ số và thanh toán"
- local test status: Frontend build passed after joining invoice rows with normalized meter history and replacing fake missing readings with `—`
- build status: Passed (`frontend: npm run build`)
- approval requested or not: requested and approved for VPS deployment
- approved or not: yes
- deployed or not: deployment is being prepared from this billing mapping patch and will be verified after push
- rollback target if needed: redeploy the previous stable `main` revision before this customer billing table/meter-reading mapping patch if the production billing view regresses
