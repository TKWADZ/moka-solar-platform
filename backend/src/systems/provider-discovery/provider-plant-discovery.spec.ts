import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeyePlantDiscoveryAdapter } from './deye-plant-discovery.adapter';
import { MonthlyPvBillingsService } from '../../monthly-pv-billings/monthly-pv-billings.service';
import { ProviderPlantDiscoveryService } from './provider-plant-discovery.service';
import { DiscoveredPlant } from './provider-plant-discovery.types';
import { SemsPlusPlantDiscoveryAdapter } from './sems-plus-plant-discovery.adapter';
import { SystemsService } from '../systems.service';

function plant(id: string, overrides: Partial<DiscoveredPlant> = {}): DiscoveredPlant {
  return {
    provider: 'DEYE',
    connectionId: 'deye-connection-1',
    externalPlantId: id,
    externalPlantName: `Remote ${id}`,
    installedCapacityKwp: 12.5,
    location: 'Provider address',
    latitude: 10.1,
    longitude: 106.2,
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'ONLINE',
    currentPowerKw: 4.2,
    todayGenerationKwh: 18.4,
    monthGenerationKwh: 321.5,
    yearGenerationKwh: 3100,
    totalGenerationKwh: 8200,
    devices: [
      {
        externalDeviceId: `device-${id}`,
        serialNumber: `SN-${id}`,
        deviceType: 'INVERTER',
        model: 'SUN-TEST',
        status: 'ONLINE',
        providerUpdatedAt: '2026-08-08T08:00:00.000Z',
        rawPayload: { serial: `SN-${id}` },
      },
    ],
    providerUpdatedAt: '2026-08-08T08:00:00.000Z',
    rawPayload: { plantId: id },
    ...overrides,
  };
}

class MemoryPrisma {
  systems: any[] = [];
  devices: any[] = [];
  customers = [{ id: 'customer-1', customerCode: 'CUS-001', deletedAt: null }];
  monthlyEnergyRecords: any[] = [];
  auditLogs: any[] = [];

  solarSystem: any;

  constructor() {
    this.solarSystem = {
      findFirst: async (args: any) => {
        const where = args.where || {};
        let found = this.systems.find((system) => {
          if (where.id && system.id !== where.id) return false;
          if (where.sourceSystem && system.sourceSystem !== where.sourceSystem) return false;
          if (where.stationId && typeof where.stationId === 'string' && system.stationId !== where.stationId) return false;
          if (where.deletedAt === null && system.deletedAt) return false;
          if (where.id?.notIn && where.id.notIn.includes(system.id)) return false;
          return true;
        });
        if (found && args.include?._count) {
          found = { ...found, _count: { contracts: 0, monthlyPvBillings: 0 } };
        }
        return found || null;
      },
      findMany: async (args: any) => {
        const where = args.where || {};
        let rows = this.systems.filter((system) => !system.deletedAt);
        if (where.OR) {
          rows = rows.filter((system) =>
            where.OR.some((clause: any) => {
              if (clause.sourceSystem && system.sourceSystem !== clause.sourceSystem) return false;
              if (clause.monitoringProvider && system.monitoringProvider !== clause.monitoringProvider) return false;
              if (clause.stationId?.in && !clause.stationId.in.includes(system.stationId)) return false;
              if (clause.monitoringPlantId?.in && !clause.monitoringPlantId.in.includes(system.monitoringPlantId)) return false;
              return true;
            }),
          );
        }
        return rows.map((row) => ({ ...row }));
      },
      create: async ({ data }: any) => {
        const created = {
          id: `system-${this.systems.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          ...data,
        };
        this.systems.push(created);
        return { ...created };
      },
      upsert: async ({ where, update, create }: any) => {
        const key = where.sourceSystem_stationId;
        const index = this.systems.findIndex(
          (system) =>
            system.sourceSystem === key.sourceSystem && system.stationId === key.stationId,
        );
        if (index >= 0) {
          this.systems[index] = { ...this.systems[index], ...update };
          return { ...this.systems[index] };
        }
        const created = {
          id: `system-${this.systems.length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          ...create,
        };
        this.systems.push(created);
        return { ...created };
      },
      update: async ({ where, data }: any) => {
        const index = this.systems.findIndex((system) => system.id === where.id);
        if (index < 0) throw new Error('System not found');
        this.systems[index] = { ...this.systems[index], ...data };
        return { ...this.systems[index] };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        this.systems = this.systems.map((system) => {
          if (system.deletedAt) return system;
          if (where.sourceSystem && system.sourceSystem !== where.sourceSystem) return system;
          if (where.deyeConnectionId && system.deyeConnectionId !== where.deyeConnectionId) return system;
          if (where.solarmanConnectionId && system.solarmanConnectionId !== where.solarmanConnectionId) return system;
          if (
            where.luxPowerDiscoveryConnectionId &&
            system.luxPowerDiscoveryConnectionId !== where.luxPowerDiscoveryConnectionId
          ) return system;
          if (where.stationId?.notIn?.includes(system.stationId)) return system;
          count += 1;
          return { ...system, ...data };
        });
        return { count };
      },
    };
  }

  device = {
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      this.devices = this.devices.map((device) => {
        if (where.systemId && device.systemId !== where.systemId) return device;
        if (where.stationId && device.stationId !== where.stationId) return device;
        if (where.deviceSn?.notIn?.includes(device.deviceSn)) return device;
        count += 1;
        return { ...device, ...data };
      });
      return { count };
    },
    upsert: async ({ where, update, create }: any) => {
      const key = where.stationId_deviceSn;
      const index = this.devices.findIndex(
        (device) => device.stationId === key.stationId && device.deviceSn === key.deviceSn,
      );
      if (index >= 0) {
        this.devices[index] = { ...this.devices[index], ...update };
        return this.devices[index];
      }
      const next = { id: `device-${this.devices.length + 1}`, ...create };
      this.devices.push(next);
      return next;
    },
  };

  customer = {
    findFirst: async ({ where }: any) =>
      this.customers.find((customer) => customer.id === where.id && !customer.deletedAt) || null,
  };

  monthlyEnergyRecord = {
    updateMany: async ({ where, data }: any) => {
      let count = 0;
      this.monthlyEnergyRecords = this.monthlyEnergyRecords.map((record) => {
        if (record.solarSystemId !== where.solarSystemId) return record;
        count += 1;
        return { ...record, ...data };
      });
      return { count };
    },
  };

  deyeConnection = { findMany: async () => [] };
  solarmanConnection = { findMany: async () => [] };
  luxPowerConnection = { findMany: async () => [] };

  $transaction = async (callback: (tx: any) => Promise<any>) => callback(this);
}

function serviceWith(plants: DiscoveredPlant[], prisma = new MemoryPrisma()) {
  const adapter = {
    provider: 'DEYE',
    capability: {
      provider: 'DEYE',
      discovery: 'AVAILABLE',
      import: 'AVAILABLE',
      message: 'ready',
    },
    listPlants: async () => plants,
  };
  const registry = {
    resolve: () => adapter,
    listCapabilities: () => [adapter.capability],
    listConnections: async () => [],
  };
  const audit = {
    log: async (entry: any) => {
      prisma.auditLogs.push(entry);
      return entry;
    },
  };
  return {
    prisma,
    service: new ProviderPlantDiscoveryService(prisma as any, registry as any, audit as any),
  };
}

describe('provider plant discovery/import', () => {
  it('imports seven remote plants as seven unassigned systems', async () => {
    const plants = Array.from({ length: 7 }, (_, index) => plant(`plant-${index + 1}`));
    const { service, prisma } = serviceWith(plants);

    const result = await service.importPlants(
      'DEYE',
      'deye-connection-1',
      plants.map((item) => item.externalPlantId),
      { userId: 'admin-1' },
    );

    assert.equal(result.imported, 7);
    assert.equal(prisma.systems.length, 7);
    assert.ok(prisma.systems.every((system) => system.customerId === null));
    assert.equal(prisma.devices.length, 7);
  });

  it('is idempotent when the same connection is imported twice', async () => {
    const plants = [plant('plant-1'), plant('plant-2')];
    const { service, prisma } = serviceWith(plants);
    const ids = plants.map((item) => item.externalPlantId);

    await service.importPlants('DEYE', 'deye-connection-1', ids, { userId: 'admin-1' });
    await service.importPlants('DEYE', 'deye-connection-1', ids, { userId: 'admin-1' });

    assert.equal(prisma.systems.length, 2);
    assert.equal(prisma.devices.length, 2);
  });

  it('preserves Moka-owned name, capacity, pricing and customer on provider refresh', async () => {
    const prisma = new MemoryPrisma();
    prisma.systems.push({
      id: 'system-1',
      sourceSystem: 'DEYE',
      monitoringProvider: 'DEYE',
      stationId: 'plant-1',
      monitoringPlantId: 'plant-1',
      deyeConnectionId: 'deye-connection-1',
      customerId: 'customer-1',
      systemCode: 'AT001',
      name: 'Moka display name',
      capacityKwp: 9.9,
      panelCount: 22,
      defaultUnitPrice: 2420,
      defaultVatRate: 8,
      defaultDiscountAmount: 5,
      deletedAt: null,
    });
    const { service } = serviceWith([plant('plant-1', { installedCapacityKwp: 15 })], prisma);

    await service.importPlants('DEYE', 'deye-connection-1', ['plant-1'], { userId: 'admin-1' });

    const updated = prisma.systems[0];
    assert.equal(updated.name, 'Moka display name');
    assert.equal(updated.capacityKwp, 9.9);
    assert.equal(updated.defaultUnitPrice, 2420);
    assert.equal(updated.defaultVatRate, 8);
    assert.equal(updated.defaultDiscountAmount, 5);
    assert.equal(updated.customerId, 'customer-1');
    assert.equal(updated.stationName, 'Remote plant-1');
    assert.equal(updated.installedCapacityKwp, 15);
  });

  it('does not replace valid production with zero when provider metrics are missing', async () => {
    const prisma = new MemoryPrisma();
    prisma.systems.push({
      id: 'system-1',
      sourceSystem: 'DEYE',
      stationId: 'plant-1',
      monitoringPlantId: 'plant-1',
      deyeConnectionId: 'deye-connection-1',
      customerId: null,
      systemCode: 'SYS-1',
      name: 'Existing',
      capacityKwp: 10,
      currentMonthGenerationKwh: 456.7,
      totalGenerationKwh: 9000,
      deletedAt: null,
    });
    const { service } = serviceWith([
      plant('plant-1', {
        currentPowerKw: null,
        monthGenerationKwh: null,
        yearGenerationKwh: null,
        totalGenerationKwh: null,
      }),
    ], prisma);

    await service.importPlants('DEYE', 'deye-connection-1', ['plant-1'], { userId: 'admin-1' });
    assert.equal(prisma.systems[0].currentMonthGenerationKwh, 456.7);
    assert.equal(prisma.systems[0].totalGenerationKwh, 9000);
  });

  it('assigns an imported system and updates existing monthly ownership without creating billing', async () => {
    const { service, prisma } = serviceWith([plant('plant-1')]);
    await service.importPlants('DEYE', 'deye-connection-1', ['plant-1'], { userId: 'admin-1' });
    const imported = prisma.systems[0];
    prisma.monthlyEnergyRecords.push({ solarSystemId: imported.id, customerId: null });

    await service.assignCustomer(imported.id, 'customer-1', 'admin-1');

    assert.equal(prisma.systems[0].customerId, 'customer-1');
    assert.equal(prisma.monthlyEnergyRecords[0].customerId, 'customer-1');
    assert.equal((prisma as any).monthlyPvBillings, undefined);
  });

  it('marks provider-bound systems missing from a successful response as disconnected', async () => {
    const prisma = new MemoryPrisma();
    prisma.systems.push({
      id: 'missing-system',
      sourceSystem: 'DEYE',
      stationId: 'missing-plant',
      deyeConnectionId: 'deye-connection-1',
      customerId: null,
      systemCode: 'SYS-MISSING',
      name: 'Missing',
      capacityKwp: 5,
      deletedAt: null,
    });
    const { service } = serviceWith([plant('visible-plant')], prisma);

    const result = await service.importPlants(
      'DEYE',
      'deye-connection-1',
      ['visible-plant'],
      { userId: 'admin-1' },
    );

    assert.equal(result.disconnected, 1);
    assert.equal(prisma.systems.find((item) => item.id === 'missing-system').lastSyncStatus, 'DISCONNECTED');
  });

  it('does not modify unrelated manual systems during provider import', async () => {
    const prisma = new MemoryPrisma();
    prisma.systems.push({
      id: 'manual-1',
      sourceSystem: 'MANUAL',
      stationId: null,
      customerId: 'customer-1',
      systemCode: 'MAN-001',
      name: 'Manual system',
      capacityKwp: 6,
      defaultUnitPrice: 2500,
      deletedAt: null,
    });
    const before = { ...prisma.systems[0] };
    const { service } = serviceWith([plant('plant-1')], prisma);

    await service.importPlants('DEYE', 'deye-connection-1', ['plant-1'], { userId: 'admin-1' });
    assert.deepEqual(prisma.systems.find((item) => item.id === 'manual-1'), before);
  });

  it('does not expose provider raw payload in discovery response', async () => {
    const { service } = serviceWith([plant('plant-1', { rawPayload: { token: 'must-not-leak' } })]);
    const result = await service.discoverPlants('DEYE', 'deye-connection-1');
    assert.equal('rawPayload' in result.plants[0], false);
    assert.equal('rawPayload' in result.plants[0].devices[0], false);
  });

  it('rejects linking into a target already bound to a different provider plant', async () => {
    const { service, prisma } = serviceWith([]);
    prisma.systems.push(
      {
        id: 'imported',
        sourceSystem: 'DEYE',
        stationId: 'plant-1',
        customerId: null,
        systemCode: 'IMP-1',
        name: 'Imported',
        capacityKwp: 5,
        deletedAt: null,
      },
      {
        id: 'target',
        sourceSystem: 'SOLARMAN',
        stationId: 'other-plant',
        customerId: 'customer-1',
        systemCode: 'TARGET-1',
        name: 'Target',
        capacityKwp: 5,
        deletedAt: null,
      },
    );

    await assert.rejects(
      () => service.linkImportedSystem('imported', 'target', 'admin-1'),
      /already linked to another provider plant/,
    );
  });

  it('maps existing Deye station discovery without changing the Deye client path', async () => {
    const adapter = new DeyePlantDiscoveryAdapter({
      previewStations: async () => ({
        stations: [
          {
            stationId: 'station-1',
            stationName: 'Station 1',
            installedCapacityKw: 8,
            locationAddress: null,
            latitude: null,
            longitude: null,
            timezone: 'Asia/Ho_Chi_Minh',
            currentGenerationPowerKw: 2,
            currentMonthGenerationKwh: 100,
            currentYearGenerationKwh: 1200,
            totalGenerationKwh: 4000,
            lastUpdateTime: null,
            devices: [],
            raw: {},
          },
        ],
      }),
    } as any);

    const result = await adapter.listPlants('connection-1');
    assert.equal(result[0].externalPlantId, 'station-1');
    assert.equal(result[0].monthGenerationKwh, 100);
  });

  it('keeps unassigned systems out of customer portal queries', async () => {
    let receivedWhere: Record<string, unknown> | null = null;
    const systemsService = new SystemsService(
      {
        solarSystem: {
          findMany: async ({ where }: any) => {
            receivedWhere = where;
            return [];
          },
        },
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await systemsService.findMine('customer-1');
    assert.deepEqual(receivedWhere, { customerId: 'customer-1', deletedAt: null });
  });

  it('rejects monthly billing creation for an unassigned imported system', async () => {
    const billingService = new MonthlyPvBillingsService(
      {
        solarSystem: {
          findFirst: async () => ({
            id: 'system-1',
            customerId: null,
            customer: null,
          }),
        },
      } as any,
      {} as any,
      {} as any,
    );

    await assert.rejects(
      () =>
        billingService.sync('system-1', {
          month: 8,
          year: 2026,
          pvGenerationKwh: 100,
        }),
      /chua duoc gan khach hang/i,
    );
  });

  it('blocks unverified provider history before monthly billing touches the database', async () => {
    let databaseTouched = false;
    const billingService = new MonthlyPvBillingsService(
      {
        solarSystem: {
          findFirst: async () => {
            databaseTouched = true;
            return null;
          },
        },
      } as any,
      {} as any,
      {} as any,
    );

    await assert.rejects(
      () =>
        billingService.sync('system-1', {
          month: 8,
          year: 2026,
          pvGenerationKwh: 100,
          source: 'SOLARMAN_MONTHLY',
        }),
      (error: any) => {
        assert.equal(error?.response?.code, 'PROVIDER_HISTORY_BILLING_BLOCKED');
        assert.deepEqual(error?.response?.reasons, ['HISTORY_CONTRACT_UNVERIFIED']);
        return true;
      },
    );
    assert.equal(databaseTouched, false);
  });

  it('reports SEMS+ monthly history as unverified without creating history rows', () => {
    const adapter = new SemsPlusPlantDiscoveryAdapter({
      hasConfiguredCredentials: () => true,
    } as any);

    assert.equal(adapter.capability.historicalDataCapability, 'UNVERIFIED');
    assert.equal(adapter.capability.monthlyHistoryAvailable, false);
    assert.equal(
      adapter.capability.historyMessage,
      'SEMS+ chưa có dữ liệu lịch sử tháng được xác minh.',
    );
  });

  it('does not classify unverified SEMS+ history as stable auto-billing data', () => {
    const billingService = new MonthlyPvBillingsService(
      {} as any,
      {} as any,
      {} as any,
    );

    assert.equal(
      (billingService as any).isStableAutoBillingProvider('SEMS_PORTAL'),
      false,
    );
    assert.equal((billingService as any).isStableAutoBillingProvider('DEYE'), true);
    assert.equal((billingService as any).isStableAutoBillingProvider('LUXPOWER'), true);
  });

  it('returns connection summaries without credential fields', async () => {
    const { service } = serviceWith([]);
    const result = await service.listConnections();
    assert.deepEqual(result.connections, []);
    assert.equal(JSON.stringify(result).includes('password'), false);
    assert.equal(JSON.stringify(result).includes('token'), false);
    assert.equal(JSON.stringify(result).includes('secret'), false);
  });

  it('removes raw provider payloads and user credentials from serialized systems', () => {
    const systemsService = new SystemsService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const serialized = (systemsService as any).serializeSystem({
      id: 'system-1',
      sourceSystem: 'DEYE',
      stationId: 'plant-1',
      capacityKwp: 10,
      externalPayload: { token: 'must-not-leak' },
      customer: {
        id: 'customer-1',
        user: {
          id: 'user-1',
          fullName: 'Customer',
          email: 'customer@example.test',
          phone: null,
          avatarUrl: null,
          passwordHash: 'must-not-leak',
          refreshToken: 'must-not-leak',
        },
      },
      devices: [
        {
          id: 'device-1',
          collectionTime: BigInt(1_723_110_400_000),
          externalPayload: { cookie: 'must-not-leak' },
        },
      ],
      monthlyEnergyRecords: [
        {
          id: 'monthly-1',
          source: 'SOLARMAN_DAILY_AGGREGATE',
          year: 2000,
          month: 12,
          rawPayload: { time: '12', privateProviderField: 'must-not-leak' },
          pvGenerationKwh: 1,
        },
      ],
    });

    assert.equal('externalPayload' in serialized, false);
    assert.equal('externalPayload' in serialized.devices[0], false);
    assert.equal('passwordHash' in serialized.customer.user, false);
    assert.equal('refreshToken' in serialized.customer.user, false);
    assert.equal('rawPayload' in serialized.monthlyEnergyRecords[0], false);
    assert.equal(serialized.monthlyEnergyRecords[0].dataQualityStatus, 'INVALID_PERIOD');
  });

  it('keeps provider-owned identity and installed capacity unchanged during Moka edits', async () => {
    let updateData: Record<string, unknown> | null = null;
    const current = {
      id: 'system-1',
      customerId: 'customer-1',
      systemCode: 'SYS-001',
      name: 'Moka display name',
      sourceSystem: 'DEYE',
      stationId: 'provider-plant-1',
      monitoringProvider: 'DEYE',
      installedCapacityKwp: 12.5,
      capacityKwp: 12,
      devices: [],
    };
    const systemsService = new SystemsService(
      {
        solarSystem: {
          update: async ({ data }: any) => {
            updateData = data;
            return { ...current, ...data };
          },
        },
      } as any,
      { log: async () => undefined } as any,
      {} as any,
      {} as any,
      {} as any,
    );
    (systemsService as any).findOne = async () => current;

    await systemsService.update(
      current.id,
      {
        capacityKwp: 13,
        sourceSystem: 'SOLARMAN',
        stationId: 'wrong-plant',
        stationName: 'Wrong provider name',
        monitoringProvider: 'SOLARMAN',
        monitoringPlantId: 'wrong-plant',
      },
      'admin-1',
    );

    assert.equal(updateData?.capacityKwp, 13);
    assert.equal(updateData?.installedCapacityKwp, undefined);
    assert.equal('sourceSystem' in (updateData || {}), false);
    assert.equal('stationId' in (updateData || {}), false);
    assert.equal('stationName' in (updateData || {}), false);
    assert.equal('monitoringProvider' in (updateData || {}), false);
    assert.equal('monitoringPlantId' in (updateData || {}), false);
  });
});
