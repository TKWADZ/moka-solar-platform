# Provider-first system import

## Why this changed

The old Admin Systems flow required a customer and a manually created `SolarSystem` before an inverter account could be queried. The new flow starts from a saved provider connection, discovers plants, imports them idempotently, and leaves unknown ownership unassigned.

The stable external identity is the existing unique pair:

```text
sourceSystem + stationId
```

No billing formula was changed.

## Admin workflow

1. Open `/admin/systems`.
2. Choose **Đồng bộ từ tài khoản inverter**.
3. Select a provider and an existing connection.
4. Choose **Kiểm tra và khám phá**.
5. Review new, linked, unassigned, disconnected, and conflicting plants.
6. Import selected plants.
7. Assign a customer, create a customer, or link the imported plant to an existing manual system.
8. Add contract and billing metadata only after ownership is confirmed.

Manual creation remains available as a fallback and always creates `sourceSystem=MANUAL`.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/systems/provider-discovery/connections` | Redacted connection summaries and provider capabilities |
| `POST` | `/api/systems/provider-discovery/preview` | Discover plants without importing |
| `POST` | `/api/systems/provider-discovery/import` | Transactional, selected, idempotent import |
| `PATCH` | `/api/systems/:id/assign-customer` | Assign an imported system to a verified customer |
| `POST` | `/api/systems/:id/link-imported-system` | Safely link an imported shell to a manual system |

Credential fields, encrypted values, cookies, tokens, and raw provider payloads are not returned by these routes.

## Ownership rules

Provider sync owns station identity, provider connection, provider name, installed capacity, location metadata, devices, generation metrics, snapshots, raw payload, and provider timestamps.

Moka Solar owns customer assignment, system code, display name, confirmed capacity, panel metadata, pricing, VAT, discount, contracts, notes, and internal status. Refreshing a provider plant does not overwrite these business fields.

An unassigned system:

- remains available to monitoring/history sync;
- is excluded from customer portal queries;
- is rejected by monthly billing creation;
- is clearly shown as `IMPORTED_UNASSIGNED` in Admin Systems.

If a plant disappears from a successful provider response, it is retained and marked `DISCONNECTED`. It is never deleted automatically.

## Provider capability matrix

| Provider | Discovery | Import | Notes |
| --- | --- | --- | --- |
| Deye | Available | Available | Reuses the existing `/v1.0/station/listWithDevice` client and device parser |
| SOLARMAN | Available | Available | Reuses the configured provider registry; customer default is optional |
| LuxPower | Available | Import with explicit binding | Reuses existing plant-list and inverter-list requests; billing sync still needs explicit legacy plant/system binding |
| GoodWe SEMS+ | Unavailable | Unavailable | Adapter and UI state exist, but no endpoint is guessed |

## Required SEMS+ capture

Before enabling unattended account discovery, provide sanitized examples for:

- login/session request and response headers with cookies/tokens removed;
- account-level plant-list request and response;
- device-list request and response for one plant;
- realtime flow request and response for one plant;
- daily and monthly history requests and responses;
- session-expiry response and retry behavior.

The capture must retain HTTP method, exact path, query/body field names, required non-secret headers, response status, and sanitized response shape. A PLANT_OWNER account must not be forced to provide `orgId` when the real request does not require it.

## LuxPower limitation

The current verified client can list all plants and devices. The legacy `LuxPowerConnection.solarSystemId` billing pipeline is still one-to-one. Imported plants therefore store `luxPowerDiscoveryConnectionId`, while production billing remains disabled until an operator explicitly completes the existing plant/system/contract binding. No new endpoint path was invented.

## Database migration

Migration `20260808163000_provider_plant_discovery` adds:

- `SolarSystem.luxPowerDiscoveryConnectionId`;
- `SolarSystem.providerLastSeenAt`;
- `SolarSystem.providerDisconnectedAt`.

It does not delete or rewrite existing systems, contracts, billing records, production history, or provider connections.

## Local validation

```powershell
cd backend
$env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/moka_solar?schema=public'
npx prisma validate
npx prisma generate
npm run test:unit
npm run typecheck
npm run build

cd ../frontend
npm run build
```

## Deployment preparation only

Do not run these commands until explicit deployment approval is given and a database backup exists.

```bash
cd /opt/mokasolar/app
git fetch origin
git checkout fix/inverter-providers-zalo-automation
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml run --rm backend npx prisma migrate deploy
docker compose -f docker-compose.prod.yml up -d --build backend frontend
docker compose -f docker-compose.prod.yml ps
curl -fsS https://mokasolar.com/api/health
```

## Rollback

Application rollback should deploy the previous known-good commit without deleting volumes. Because this migration only adds nullable columns and a foreign key, leave it in place during an emergency code rollback. Dropping columns is not an emergency rollback and must only happen after a separate verified backup and data review.

```bash
git checkout <previous-known-good-commit>
docker compose -f docker-compose.prod.yml up -d --build backend frontend
docker compose -f docker-compose.prod.yml ps
curl -fsS https://mokasolar.com/api/health
```
