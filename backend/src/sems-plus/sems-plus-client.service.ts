import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SemsPlusCredentialOverrides,
  SemsPlusRequestMetadata,
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
  diagnostics: {
    profileHttpStatus: number | null;
    profileProviderStatus: string | null;
    roleKey: string | null;
    userType: string | null;
    hasOrgId: boolean;
    permissionsCount: number;
    stationTypeCount: number;
    fullStationRowsReturned: number;
    uniqueStationIdsReturned: number;
    stationDetailSuccessCount: number;
    stationDetailFailureCount: number;
    finalMergedPlantCount: number;
  };
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
      let profileRequest: SemsPlusRequestMetadata | null = null;
      const profilePayload = await this.sessionManager.request(session, {
        method: 'GET',
        path: '/web/sems/sems-user/api/v1/user/get-user',
      }, (metadata) => {
        profileRequest = metadata;
      });
      const profile = parseSemsPlusProfile(profilePayload);
      if (!profile.roleKey) {
        throw new BadGatewayException({
          message: 'SEMS+ profile response is missing its role identity.',
          provider: 'SEMS_PORTAL',
          errorCategory: 'SCHEMA_CHANGED',
          endpoint: '/web/sems/sems-user/api/v1/user/get-user',
          httpStatus: profileRequest?.httpStatus ?? 200,
          providerCode: profileRequest?.providerCode ?? null,
          sessionCreated: true,
        });
      }
      // PLANT_OWNER legitimately has no orgId and may have empty permission arrays.

      let stationTypeRequest: SemsPlusRequestMetadata | null = null;
      const typePayload = await this.sessionManager.request(session, {
        method: 'GET',
        path: '/sems/sems-dashboard-web/api/front/page/getStationType',
      }, (metadata) => {
        stationTypeRequest = metadata;
      });
      const stationTypes = parseSemsPlusStationTypes(typePayload);
      if (!stationTypes.length) {
        throw new BadGatewayException({
          message: 'SEMS+ station type response did not match the verified schema.',
          provider: 'SEMS_PORTAL',
          errorCategory: 'SCHEMA_CHANGED',
          endpoint: '/sems/sems-dashboard-web/api/front/page/getStationType',
          httpStatus: stationTypeRequest?.httpStatus ?? null,
          providerCode: stationTypeRequest?.providerCode ?? null,
          sessionCreated: true,
        });
      }

      const fullPlantList: SemsPlusRecord[] = [];
      let lastStationPageRequest: SemsPlusRequestMetadata | null = null;
      for (const stationTypeEnum of stationTypes) {
        const stationPages = await this.fetchStationPages(session, stationTypeEnum);
        fullPlantList.push(...stationPages.rows);
        lastStationPageRequest = stationPages.lastRequest ?? lastStationPageRequest;
      }

      const deduplicated = mergeSemsPlusPlantRecords(fullPlantList, []);
      const stationOverview: SemsPlusRecord[] = [];
      let stationDetailFailureCount = 0;
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
          stationDetailFailureCount += 1;
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
          endpoint: '/sems/sems-dashboard-web/api/front/page/stationPage',
          httpStatus: lastStationPageRequest?.httpStatus ?? null,
          providerCode: lastStationPageRequest?.providerCode ?? null,
          sessionCreated: true,
        });
      }

      return {
        baseApi: session.apiBaseUrl,
        plants,
        fullPlantList: deduplicated,
        stationOverview,
        diagnostics: {
          profileHttpStatus: profileRequest?.httpStatus ?? null,
          profileProviderStatus: profileRequest?.providerCode ?? null,
          roleKey: profile.roleKey,
          userType: profile.userType,
          hasOrgId: Boolean(profile.orgId),
          permissionsCount: profile.permissions.length + profile.permissionList.length,
          stationTypeCount: stationTypes.length,
          fullStationRowsReturned: fullPlantList.length,
          uniqueStationIdsReturned: deduplicated.length,
          stationDetailSuccessCount: stationOverview.length,
          stationDetailFailureCount,
          finalMergedPlantCount: plants.length,
        },
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
    let lastRequest: SemsPlusRequestMetadata | null = null;
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
      }, (metadata) => {
        lastRequest = metadata;
      });
      const page = parseSemsPlusStationPage(payload);
      rows.push(...page.rows);
      total = page.total;
      if (!page.rows.length || page.rows.length < size) break;
      current += 1;
    }

    return { rows, lastRequest };
  }
}
