# LuxPower Integration

## Muc tieu

Module LuxPower duoc them theo huong backend-only de Moka Solar co the dang nhap portal monitor cua LuxPower, giu session trong server, tach raw payload thanh pipeline monitor -> normalize -> link system -> monthly billing ma khong dua secret hay session ra browser.

## Vi tri trong admin

- Trang cau hinh: `http://localhost:3000/admin/luxpower`
- Trang debug pipeline: `http://localhost:3000/admin/luxpower/debug`
- API backend:
  - `GET /api/luxpower-connections`
  - `POST /api/luxpower-connections`
  - `PATCH /api/luxpower-connections/:id`
  - `DELETE /api/luxpower-connections/:id`
  - `POST /api/luxpower-connections/:id/test`
  - `POST /api/luxpower-connections/:id/sync`
  - `POST /api/luxpower-connections/:id/pipeline-preview`
  - `GET /api/luxpower-connections/:id/logs`

## Cau hinh

Moi connection LuxPower co cac truong:

- `accountName`
- `username`
- `password`
- `plantId`
- `inverterSerial`
- `customerId`
- `solarSystemId`
- `contractId`
- `billingRuleLabel`
- `pollingIntervalMinutes`
- `useDemoMode`
- `status`
- `notes`

Secret duoc xu ly o backend:

- password LuxPower duoc ma hoa truoc khi luu
- session cookie chi ton tai trong memory cache cua backend
- frontend chi nhan duoc preview an toan va snapshot da normalize

## Bien moi truong

Them vao env khi can:

- `LUXPOWER_BASE_URL`
  - mac dinh: `https://server.luxpowertek.com/WManage`
- `LUXPOWER_SETTINGS_SECRET`
  - khoa ma hoa password LuxPower luu trong DB
- `LUXPOWER_SYNC_SCAN_MINUTES`
  - chu ky backend quet connection den han sync
- `LUXPOWER_DEMO_PLANT_ID`
  - mac dinh: `15804`
- `LUXPOWER_DEMO_SERIAL`
  - mac dinh: `1514025004`

## Trang thai pipeline

Moi connection hien co 4 trang thai ro rang:

- `Auth ready`
  - login/session LuxPower hop le
- `Metrics available`
  - da co normalized realtime/daily/monthly metrics
- `Plant linked`
  - da link day du plant LuxPower voi customer va system/site trong Moka
- `Billing ready`
  - chi bat khi co `contractId`, co monthly normalized metrics, va billing source hop le co du lieu

## Endpoint da duoc abstract

Module hien dang dung cac buoc/endpoint sau:

- `GET /web/login/viewDemoPlant?customCompany=`
  - bootstrap public demo session
- `POST /web/login`
  - login bang username/password LuxPower
- `POST /web/config/plant/list/viewer`
  - lay danh sach plant
- `POST /web/config/inverter/list`
  - lay danh sach inverter theo plant
- `POST /web/monitor/lsp/overview/treeJson`
  - fallback discover serial tu monitoring tree
- `POST /api/lsp/inverter/getInverterRuntime`
  - lay runtime hien tai
- `POST /api/lsp/inverter/getInverterEnergyInfo`
  - lay du lieu san luong/ngang luu dien
- `POST /api/lsp/inverterChart/dayMultiLine`
  - lay realtime series trong ngay
- `POST /api/inverterChart/monthColumn`
  - lay daily aggregate theo thang, duoc quet nhieu thang de tao lich su billing
- `POST /api/inverterChart/yearColumn`
  - lay monthly aggregate theo nam, dung de doi chieu/fallback
- `POST /api/inverterChart/totalColumn`
  - lay tong hop lifetime/historical aggregate

Neu LuxPower doi endpoint hoac session het han:

- backend tu clear session cache
- dang nhap lai 1 lan
- neu van that bai thi tra loi loi an toan va ghi log

## Pipeline du lieu

Pipeline hien tai tach 3 fetcher rieng:

- `realtime`
- `daily aggregate`
- `monthly aggregate`

History sync hien tai:

- quet daily aggregate cho nhieu thang gan day
- quet monthly aggregate cho nhieu nam gan day
- luu raw payload moi window vao `LuxPowerDebugSnapshot`
- normalize daily metric truoc
- tu daily metric build monthly aggregation de phuc vu billing
- monthly endpoint cua LuxPower duoc giu lam fallback va doi chieu mapping

Moi lan `test` hoac `sync` se:

1. lay raw payload
2. luu vao `LuxPowerDebugSnapshot`
3. normalize vao `LuxPowerNormalizedMetric`
4. neu da linked system thi day vao `SolarSystem.latestMonitorSnapshot`
5. neu da linked contract + billing source hop le thi sync sang `MonthlyEnergyRecord` va `MonthlyPvBilling`

## Man debug pipeline

`/admin/luxpower/debug` hien 3 lop du lieu de doi chieu:

- raw LuxPower response
- normalized daily metrics
- monthly billing preview

Muc tieu la de kiem tra nhanh chuoi:

`raw payload -> normalized metric -> linked system/contract -> monthly billing`

## Scale va normalize

- tat ca field nang luong dang `e*Day` trong daily/monthly aggregate deu dung scale `0.1`
  - `normalized_kwh = raw_value / 10`
- cac field realtime nhu:
  - `solarPv`
  - `gridPower`
  - `batteryDischarging`
  - `consumption`
  - `soc`
  - `acCouplePower`
  giu nguyen don vi tu payload thuc
- debug pipeline luu ro:
  - `raw_value`
  - `scale_factor`
  - `normalized_value`

## Truong du lieu da map

Snapshot normalize hien tai ho tro:

- `pv_power_w`
- `load_power_w`
- `grid_power_w`
- `battery_power_w`
- `battery_soc_percent`
- `daily_inverter_output_kwh`
- `daily_to_user_kwh`
- `daily_consumption_kwh`
- `monthly_inverter_output_kwh`
- `monthly_to_user_kwh`
- `monthly_consumption_kwh`
- `daily_pv_kwh`
- `monthly_pv_kwh`
- `total_pv_kwh`
- `grid_import_kwh`
- `grid_export_kwh`
- `captured_at`

Du lieu sau sync se duoc day vao:

- `SolarSystem.monitoringProvider = LUXPOWER`
- `SolarSystem.monitoringPlantId`
- `SolarSystem.sourceSystem = LUXPOWER`
- `SolarSystem.stationId`
- `SolarSystem.stationName`
- `SolarSystem.currentGenerationPowerKw`
- `SolarSystem.totalGenerationKwh`
- `SolarSystem.latestMonitorAt`
- `SolarSystem.lastRealtimeSyncAt`
- `SolarSystem.lastHourlySyncAt`
- `SolarSystem.latestMonitorSnapshot`

## Billing source theo contract

LuxPower hien cho phep chon billing source theo contract/connection:

- `E_INV_DAY`
  - doc tu `eInvDay / 10`
- `E_TO_USER_DAY`
  - doc tu `eToUserDay / 10`
- `E_CONSUMPTION_DAY`
  - doc tu `eConsumptionDay / 10`

Neu source duoc chon khong co du lieu hop le trong monthly aggregate thi:

- `Billing ready = false`
- he thong van luu raw + normalized metric
- admin se thay warning ro trong UI va sync log
- monthly billing preview van hien ly do block theo tung thang

## Logging

Moi lan test/sync se ghi vao `LuxPowerSyncLog`:

- `action`
- `status`
- `message`
- `providerCode`
- `context`
- `responsePayload`
- `startedAt`
- `finishedAt`

Connection cung luu:

- `lastLoginAt`
- `lastSyncTime`
- `lastError`
- `lastProviderResponse`

## Cach test local

### 1. Chay local stack

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up --build
```

### 2. Dang nhap admin local

- URL: `http://localhost:3000/login`
- Tai khoan mau local:
  - email: `admin@mokasolar.local`
  - password: `ChangeMe123!`

### 3. Tao connection an toan bang demo mode

Tai `/admin/luxpower`:

- bat `useDemoMode`
- `plantId = 15804`
- `inverterSerial = 1514025004`
- link vao 1 system local

### 4. Test connection

- bam `Test ket noi`
- ky vong:
  - session mode = `DEMO`
  - co plant/inverter list
  - co realtime snapshot
  - co daily aggregate
  - co monthly aggregate
  - co log `TEST_CONNECTION`

### 5. Sync pipeline

- bam `Sync pipeline`
- ky vong:
  - `systemUpdated = true` neu da linked system
  - system duoc cap nhat `latestMonitorSnapshot`
  - normalized metrics va debug snapshots tang len
  - neu contract + billing source hop le thi tao/cap nhat `MonthlyPvBilling`
  - co log `MANUAL_SYNC`

### 6. Man debug admin

Tai `/admin/luxpower`:

- xem 4 trang thai pipeline
- xem linked customer/system/contract
- xem raw/debug snapshot JSON
- xem normalized metric JSON
- xem billing source va gia tri monthly metric gan nhat

## Ket qua local hien tai

Voi demo plant LuxPower cong khai:

- login/session: OK
- realtime: OK
- daily aggregate: OK
- monthly aggregate: OK
- normalized metrics: OK
- plant linked: OK sau khi gan customer/system/contract
- monthly billing: CHUA BAT trong demo sample vi `eInvDay`, `eToUserDay`, `eConsumptionDay` dang bang `0`

Dieu nay co nghia la pipeline da dung, va `Billing ready` dang duoc giu tat dung logic cho den khi co billing source thuc su hop le.

## Chuyen sang tai khoan that

Khi co credential LuxPower that:

1. tat `useDemoMode`
2. nhap `username` va `password`
3. bo sung `plantId` va/hoac `inverterSerial`
4. bam `Test ket noi`
5. kiem tra log va snapshot

## Diem can luu y

- Khong dua session LuxPower ra frontend
- Khong log plaintext password
- Neu plant/inverter doi trong account, can cap nhat `plantId` hoac `inverterSerial`
- Day la browser-workflow reverse engineered, nen co the can cap nhat neu LuxPower doi HTML form hoac endpoint
