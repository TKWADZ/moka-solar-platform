# Inverter provider capability matrix

Status as of 2026-08-08:

| Provider | Authentication | Discovery/import | Telemetry/history | Change in this patch |
| --- | --- | --- | --- | --- |
| Deye | Official API | Available; idempotent upsert | Existing production implementation | No implementation change; regression tests only |
| LuxPower | Existing portal session implementation | Available through the unified import screen | Existing realtime and billing history pipeline | No endpoint, session, or mapper change; regression tests only |
| SOLARMAN | Official OpenAPI plus encrypted rotating Web OAuth refresh token; legacy cookie/manual modes preserved | Available through saved connections with idempotent station upsert | Existing official/history pipeline preserved | VPS-proven refresh mode added without cookies or password fallback |
| GoodWe SEMS+ | Backend-only account session with current SEMS+ signature | Available when server credentials are configured | Plant discovery and safe legacy summary only; device/history remain pending | Replaces obsolete SEMS Portal discovery path |

All providers use provider plus external plant ID for idempotent import. Newly discovered systems remain unassigned, continue provider synchronization where supported, and do not appear in customer portals or billing until explicitly assigned.

Missing metrics remain `null`. A temporary provider failure does not overwrite the latest valid generation values with zero.
