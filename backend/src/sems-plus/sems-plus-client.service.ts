import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SemsPlusCredentialOverrides,
  SemsPlusSession,
  SemsPlusSessionManager,
} from './sems-plus-session.manager';
import {
  ParsedSemsPlusPlant,
  SemsPlusRecord,
  asSemsPlusRecord,
  mergeSemsPlusPlantRecords,
  parseSemsPlusPlant,
  parseSemsPlusProfile,
  parseSemsPlusStationPage,
  parseSemsPlusStationTypes,
  readPlantId,
  unwrapSemsPlusData,
} from './sems-plus.parser';

export const SEMS_PLUS_ENV_CONNECTION_ID = 'sems-plus-server-config';

export type SemsPlusDiscoveryResult = {
  baseApi: string;
  plants: ParsedSemsPlusPlant[];
  fullPlantList: SemsPlusRecord[];
  stationOverview: SemsPlusRecord[];
};

@Injectable()
export class SemsPlusClientService {
  constructor(
    private readonly sessionManager: SemsPlusSessionManager,
    private readonly configService: ConfigService,
  ) {}

  hasConfiguredCredentials() {
    return this.sessionManager.hasConfiguredCredentials();
  }

  connectionSummary() {
    if (!this.hasConfiguredCredentials()) return null;
    return {
      provider: 'SEMS_PORTAL' as const,
      id: SEMS_PLUS_ENV_CONNECTION_ID,
      name: 'GoodWe SEMS+ (server config)',
      status: 'CONFIGURED',
      mode: 'SEMS_PLUS',
      lastSuccessfulSyncAt: null,
      lastError: null,
    };
  }

  async discoverPlants(
    overrides: SemsPlusCredentialOverrides = {},
  ): Promise<SemsPlusDiscoveryResult> {
    return this.sessionManager.withSession(overrides, async (session) => {
      const profilePayload = await this.sessionManager.request(session, {
        method: 'GET',
        path: '/web/sems/sems-user/api/v1/user/get-user',
      });
      const profile = parseSemsPlusProfile(profilePayload);
      if (!profile.roleKey) {
        throw new BadGatewayException({
          message: 'SEMS+ profile response is missing its role identity.',
          provider: 'SEMS_PORTAL',
          errorCategory: 'SCHEMA_CHANGED',
        });
      }
      // PLANT_OWNER legitimately has no orgId and may have empty permission arrays.

      const typePayload = await this.sessionManager.request(session, {
        method: 'GET',
        path: '/sems/sems-dashboard-web/api/front/page/getStationType',
      });
      const stationTypes = parseSemsPlusStationTypes(typePayload);
      if (!stationTypes.length) {
        throw new BadGatewayException({
          message: 'SEMS+ station type response did not match the verified schema.',
          provider: 'SEMS_PORTAL',
          errorCategory: 'SCHEMA_CHANGED',
        });
      }

      const fullPlantList: SemsPlusRecord[] = [];
      for (const stationTypeEnum of stationTypes) {
        fullPlantList.push(
          ...(await this.fetchStationPages(session, stationTypeEnum)),
        );
      }

      const deduplicated = mergeSemsPlusPlantRecords(fullPlantList, []);
      const stationOverview: SemsPlusRecord[] = [];
      for (const plant of deduplicated) {
        const plantId = readPlantId(plant);
        if (!plantId) continue;
        try {
          const detailPayload = await this.sessionManager.request(session, {
            method: 'GET',
            path: `/sems/sems-dashboard-web/api/front/page/stationDetail/${encodeURIComponent(plantId)}`,
          });
          stationOverview.push({
            ...asSemsPlusRecord(unwrapSemsPlusData(detailPayload)),
            id: plantId,
          });
        } catch (error) {
          if (this.sessionManager.isAuthenticationError(error)) throw error;
          // A detail failure must not remove an offline plant from the account-level list.
        }
      }

      const merged = mergeSemsPlusPlantRecords(deduplicated, stationOverview);
      const plants = merged
        .map(parseSemsPlusPlant)
        .filter((item): item is ParsedSemsPlusPlant => Boolean(item));
      if (!plants.length) {
        throw new BadGatewayException({
          message: 'SEMS+ returned no parseable plants.',
          provider: 'SEMS_PORTAL',
          errorCategory: 'SCHEMA_CHANGED',
        });
      }

      return {
        baseApi: session.apiBaseUrl,
        plants,
        fullPlantList: deduplicated,
        stationOverview,
      };
    });
  }

  async fetchPlantData(
    plantId: string,
    overrides: SemsPlusCredentialOverrides = {},
  ) {
    const normalizedPlantId = plantId.trim();
    if (!normalizedPlantId) {
      throw new BadRequestException('SEMS+ plant ID is required.');
    }
    const result = await this.discoverPlants(overrides);
    const plant = result.plants.find((item) => item.plantId === normalizedPlantId);
    if (!plant) {
      throw new BadRequestException('SEMS+ did not return the requested plant ID.');
    }
    return { ...result, plant };
  }

  private async fetchStationPages(session: SemsPlusSession, stationTypeEnum: string) {
    const configuredSize = Number(
      this.configService.get('SEMS_PLUS_PAGE_SIZE') || 200,
    );
    const size = Number.isFinite(configuredSize)
      ? Math.max(1, Math.min(1000, Math.trunc(configuredSize)))
      : 200;
    const rows: SemsPlusRecord[] = [];
    let current = 1;
    let total = Number.POSITIVE_INFINITY;

    while (rows.length < total && current <= 100) {
      const payload = await this.sessionManager.request(session, {
        method: 'POST',
        path: '/sems/sems-dashboard-web/api/front/page/stationPage',
        body: {
          size,
          current,
          order: { column: 'createTime', asc: false },
          stationTypeEnum,
          stationAddress: null,
          email: null,
          phone: null,
          unifiedTextSearch: null,
        },
      });
      const page = parseSemsPlusStationPage(payload);
      rows.push(...page.rows);
      total = page.total;
      if (!page.rows.length || page.rows.length < size) break;
      current += 1;
    }

    return rows;
  }
}
