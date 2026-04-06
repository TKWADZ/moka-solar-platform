import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LuxPowerDayPoint,
  LuxPowerInverterRecord,
  LuxPowerPlantRecord,
  LuxPowerSnapshot,
  asRecord,
  buildLuxPowerSnapshot,
  parseLuxPowerDayChart,
  parseLuxPowerEnergy,
  parseLuxPowerInverters,
  parseLuxPowerPlants,
  parseLuxPowerRuntime,
} from './luxpower.parser';

export type LuxPowerConnectionConfig = {
  id: string;
  username?: string | null;
  password?: string | null;
  plantId?: string | null;
  inverterSerial?: string | null;
  useDemoMode?: boolean;
};

type LuxPowerSessionMode = 'LOGIN' | 'DEMO';

type LuxPowerSession = {
  mode: LuxPowerSessionMode;
  cookieJar: string;
  referer: string;
};

type SessionCacheValue = {
  session: LuxPowerSession;
  expiresAt: number;
};

type ResolvedTarget = {
  plant: LuxPowerPlantRecord | null;
  inverter: LuxPowerInverterRecord | null;
  plants: LuxPowerPlantRecord[];
  inverters: LuxPowerInverterRecord[];
  warnings: string[];
};

class LuxPowerSessionExpiredError extends Error {
  constructor(message = 'LuxPower session expired') {
    super(message);
    this.name = 'LuxPowerSessionExpiredError';
  }
}

@Injectable()
export class LuxPowerClientService {
  private readonly timeoutMs: number;
  private readonly sessionCache = new Map<string, SessionCacheValue>();

  constructor(private readonly configService: ConfigService) {
    this.timeoutMs = Number(this.configService.get('REQUEST_TIMEOUT') || 20000);
  }

  clearSession(connectionId: string) {
    this.sessionCache.delete(connectionId);
  }

  async testConnection(connection: LuxPowerConnectionConfig) {
    return this.withSessionRetry(connection, async (session) => {
      const resolvedTarget = await this.resolveTarget(session, connection);
      const snapshot = await this.fetchSnapshotForTarget(session, resolvedTarget);

      return {
        sessionMode: session.mode,
        resolvedTarget,
        snapshot,
      };
    });
  }

  async fetchConnectionSnapshot(
    connection: LuxPowerConnectionConfig,
    options?: { forceRelogin?: boolean },
  ) {
    if (options?.forceRelogin) {
      this.clearSession(connection.id);
    }

    return this.withSessionRetry(connection, async (session) => {
      const resolvedTarget = await this.resolveTarget(session, connection);
      const snapshot = await this.fetchSnapshotForTarget(session, resolvedTarget);

      return {
        sessionMode: session.mode,
        resolvedTarget,
        snapshot,
      };
    });
  }

  private async withSessionRetry<T>(
    connection: LuxPowerConnectionConfig,
    action: (session: LuxPowerSession) => Promise<T>,
  ) {
    const firstSession = await this.getOrCreateSession(connection);

    try {
      return await action(firstSession);
    } catch (error) {
      if (!(error instanceof LuxPowerSessionExpiredError)) {
        throw error;
      }

      this.clearSession(connection.id);
      const secondSession = await this.getOrCreateSession(connection);
      return action(secondSession);
    }
  }

  private async getOrCreateSession(connection: LuxPowerConnectionConfig) {
    const cached = this.sessionCache.get(connection.id);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.session;
    }

    const session = connection.useDemoMode
      ? await this.bootstrapDemoSession()
      : await this.loginWithPortal(connection);

    this.sessionCache.set(connection.id, {
      session,
      expiresAt: Date.now() + 25 * 60 * 1000,
    });

    return session;
  }

  private async loginWithPortal(connection: LuxPowerConnectionConfig): Promise<LuxPowerSession> {
    if (!connection.username?.trim() || !connection.password?.trim()) {
      throw new BadRequestException(
        'LuxPower username va password la bat buoc khi khong dung che do demo.',
      );
    }

    const initial = await this.requestText(this.baseUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const loginResponse = await this.requestText(this.resolveUrl('/web/login'), {
      method: 'POST',
      cookieJar: initial.cookieJar,
      contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
      body: new URLSearchParams({
        account: connection.username.trim(),
        password: connection.password.trim(),
      }).toString(),
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Origin: this.origin,
        Referer: this.baseUrl,
      },
    });

    if (loginResponse.status === 302) {
      const location = loginResponse.location || '';
      if (location.includes('/web/login')) {
        throw new BadGatewayException({
          message: 'Dang nhap LuxPower that bai. Portal van tra ve trang login.',
          provider: 'LUXPOWER',
          location,
        });
      }

      const targetUrl = location
        ? this.resolveUrl(location)
        : this.resolveUrl(`/web/monitor/lsp/inverter?serialNum=${connection.inverterSerial || ''}`);

      const landing = await this.requestText(targetUrl, {
        method: 'GET',
        cookieJar: loginResponse.cookieJar,
        headers: {
          Referer: this.baseUrl,
        },
      });

      return {
        mode: 'LOGIN',
        cookieJar: landing.cookieJar,
        referer: landing.url,
      };
    }

    if (this.looksLikeLoginPage(loginResponse.text)) {
      throw new BadGatewayException({
        message: 'Dang nhap LuxPower that bai. Portal khong tao duoc session hop le.',
        provider: 'LUXPOWER',
      });
    }

    return {
      mode: 'LOGIN',
      cookieJar: loginResponse.cookieJar,
      referer: loginResponse.url,
    };
  }

  private async bootstrapDemoSession(): Promise<LuxPowerSession> {
    const response = await this.requestText(this.resolveUrl('/web/login/viewDemoPlant?customCompany='), {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: this.baseUrl,
      },
    });

    const targetUrl = response.location
      ? this.resolveUrl(response.location)
      : this.resolveUrl(
          `/web/monitor/lsp/inverter?serialNum=${this.demoSerial}`,
        );
    const landing = await this.requestText(targetUrl, {
      method: 'GET',
      cookieJar: response.cookieJar,
      headers: {
        Referer: this.baseUrl,
      },
    });

    return {
      mode: 'DEMO',
      cookieJar: landing.cookieJar,
      referer: landing.url,
    };
  }

  private async resolveTarget(
    session: LuxPowerSession,
    connection: LuxPowerConnectionConfig,
  ): Promise<ResolvedTarget> {
    const warnings: string[] = [];
    const plants = await this.listPlants(session);
    let plant =
      plants.find((item) => item.plantId === String(connection.plantId || '').trim()) || null;

    if (!plant && connection.plantId?.trim()) {
      warnings.push(`Khong tim thay plantId ${connection.plantId} trong tai khoan LuxPower.`);
    }

    if (!plant && plants.length) {
      plant = plants[0];
      warnings.push(`Dang dung plant dau tien ${plant.plantId} de test/sync vi chua cau hinh plantId hop le.`);
    }

    if (!plant && connection.useDemoMode) {
      plant = {
        plantId: this.demoPlantId,
        plantName: 'LuxPower public demo',
        createdAt: null,
        raw: {},
      };
      warnings.push('Dang dung plant demo cong khai cua LuxPower.');
    }

    let inverters = plant ? await this.listInverters(session, plant.plantId) : [];
    let inverter =
      inverters.find(
        (item) =>
          item.serialNumber === String(connection.inverterSerial || '').trim(),
      ) || null;

    if (!inverter && connection.inverterSerial?.trim()) {
      const fallback = {
        serialNumber: connection.inverterSerial.trim(),
        plantId: plant?.plantId || connection.plantId?.trim() || null,
        plantName: plant?.plantName || null,
        model: null,
        deviceType: null,
        statusText: null,
        powerRatingText: null,
        lastUpdateTime: null,
        raw: {},
      } satisfies LuxPowerInverterRecord;
      inverter = fallback;
      warnings.push(
        `Khong tim thay serial ${connection.inverterSerial} trong danh sach inverter, se thu goi runtime truc tiep bang serial nay.`,
      );
    }

    if (!inverter && plant) {
      const treeInverters = await this.listInvertersFromTree(session, plant.plantId);
      if (treeInverters.length && !inverters.length) {
        inverters = treeInverters;
      }
      inverter = treeInverters[0] || inverters[0] || null;
    }

    if (!inverter && connection.useDemoMode) {
      inverter = {
        serialNumber: this.demoSerial,
        plantId: plant?.plantId || this.demoPlantId,
        plantName: plant?.plantName || 'LuxPower public demo',
        model: null,
        deviceType: null,
        statusText: null,
        powerRatingText: null,
        lastUpdateTime: null,
        raw: {},
      };
      warnings.push('Dang dung inverter demo cong khai cua LuxPower.');
    }

    if (!inverter?.serialNumber) {
      throw new BadRequestException(
        'Khong xac dinh duoc inverter serial tu LuxPower. Hay bo sung inverterSerial hoac plantId.',
      );
    }

    return {
      plant,
      inverter,
      plants,
      inverters,
      warnings,
    };
  }

  private async fetchSnapshotForTarget(session: LuxPowerSession, target: ResolvedTarget) {
    const runtimePayload = await this.requestJson('/api/lsp/inverter/getInverterRuntime', {
      session,
      payload: { serialNum: target.inverter!.serialNumber },
      referer: this.resolveUrl(`/web/monitor/lsp/inverter?serialNum=${target.inverter!.serialNumber}`),
    });
    const energyPayload = await this.requestJson('/api/lsp/inverter/getInverterEnergyInfo', {
      session,
      payload: { serialNum: target.inverter!.serialNumber },
      referer: this.resolveUrl(`/web/monitor/lsp/inverter?serialNum=${target.inverter!.serialNumber}`),
    });

    let daySeries: LuxPowerDayPoint[] = [];
    try {
      const dayPayload = await this.requestJson('/api/lsp/inverterChart/dayMultiLine', {
        session,
        payload: {
          serialNum: target.inverter!.serialNumber,
          dateText: new Date().toISOString().slice(0, 10),
        },
        referer: this.resolveUrl(`/web/monitor/lsp/inverter?serialNum=${target.inverter!.serialNumber}`),
      });
      daySeries = parseLuxPowerDayChart(dayPayload);
    } catch {
      daySeries = [];
    }

    return buildLuxPowerSnapshot({
      sourceMode: session.mode,
      plant: target.plant,
      inverter: target.inverter,
      runtime: parseLuxPowerRuntime(runtimePayload),
      energy: parseLuxPowerEnergy(energyPayload),
      daySeries,
    });
  }

  private async listPlants(session: LuxPowerSession) {
    const payload = await this.requestJson('/web/config/plant/list/viewer', {
      session,
      payload: {
        page: 1,
        rows: 50,
        sort: 'createDate',
        order: 'desc',
        forSelect: true,
      },
      referer: session.referer,
    });

    return parseLuxPowerPlants(payload);
  }

  private async listInverters(session: LuxPowerSession, plantId: string) {
    const payload = await this.requestJson('/web/config/inverter/list', {
      session,
      payload: {
        plantId,
        page: 1,
        rows: 50,
        sort: 'createDate',
        order: 'desc',
      },
      referer: session.referer,
    });

    return parseLuxPowerInverters(payload);
  }

  private async listInvertersFromTree(session: LuxPowerSession, plantId: string) {
    const payload = await this.requestJson('/web/monitor/lsp/overview/treeJson', {
      session,
      payload: { plantId },
      referer: session.referer,
    });

    const nodes = Array.isArray(payload) ? payload : [];
    const inverters: LuxPowerInverterRecord[] = [];

    const visit = (value: unknown) => {
      if (!value || typeof value !== 'object') {
        return;
      }

      const node = asRecord(value);
      if (String(node.type || '').toUpperCase() === 'INVERTER') {
        const serialNumber = String(node.id || '').trim();
        if (serialNumber) {
          inverters.push({
            serialNumber,
            plantId,
            plantName: null,
            model: null,
            deviceType: toNullableString(node.iconCls),
            statusText: null,
            powerRatingText: null,
            lastUpdateTime: null,
            raw: node,
          });
        }
      }

      const children = Array.isArray(node.children) ? node.children : [];
      for (const child of children) {
        visit(child);
      }
    };

    for (const node of nodes) {
      visit(node);
    }

    return inverters;
  }

  private async requestJson(
    endpoint: string,
    options: {
      session: LuxPowerSession;
      payload?: Record<string, unknown>;
      referer?: string | null;
    },
  ) {
    const response = await this.requestText(this.resolveUrl(endpoint), {
      method: 'POST',
      cookieJar: options.session.cookieJar,
      contentType: 'application/x-www-form-urlencoded; charset=UTF-8',
      body: new URLSearchParams(
        Object.entries(options.payload || {}).flatMap(([key, value]) =>
          value === undefined || value === null || value === ''
            ? []
            : [[key, String(value)]],
        ),
      ).toString(),
      headers: {
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: this.origin,
        Referer: options.referer || options.session.referer || this.baseUrl,
      },
    });

    if (response.status === 302) {
      throw new LuxPowerSessionExpiredError();
    }

    if (this.looksLikeLoginPage(response.text)) {
      throw new LuxPowerSessionExpiredError();
    }

    try {
      const body = JSON.parse(response.text) as Record<string, unknown>;
      if (body.success === false) {
        throw new BadGatewayException({
          message:
            toNullableString(body.message) ||
            toNullableString(body.msg) ||
            'LuxPower provider tra ve success=false.',
          provider: 'LUXPOWER',
          response: body,
        });
      }

      return body;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }

      throw new BadGatewayException({
        message: 'LuxPower provider tra ve du lieu khong hop le.',
        provider: 'LUXPOWER',
        detail: response.text.slice(0, 500),
      });
    }
  }

  private async requestText(
    url: string,
    options: {
      method: 'GET' | 'POST';
      headers?: Record<string, string>;
      body?: string;
      cookieJar?: string | null;
      contentType?: string;
    },
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0',
        ...(options.contentType ? { 'Content-Type': options.contentType } : {}),
        ...(options.cookieJar ? { Cookie: options.cookieJar } : {}),
        ...(options.headers || {}),
      };

      const response = await fetch(url, {
        method: options.method,
        redirect: 'manual',
        headers,
        body: options.body,
        signal: controller.signal,
      });
      const text = await response.text();
      const cookieJar = this.extractCookieJar(response, options.cookieJar || null) || '';

      return {
        status: response.status,
        text,
        cookieJar,
        location: response.headers.get('location'),
        url: response.url || url,
      };
    } catch (error) {
      throw new BadGatewayException({
        message: 'Khong the ket noi toi LuxPower cloud.',
        provider: 'LUXPOWER',
        detail: error instanceof Error ? error.message : 'Unknown network error',
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private looksLikeLoginPage(text: string) {
    return (
      text.includes('name="account"') ||
      text.includes('id="account"') ||
      text.includes('action="/WManage/web/login"')
    );
  }

  private extractCookieJar(response: Response, fallback: string | null) {
    const headerAny = response.headers as Headers & {
      getSetCookie?: () => string[];
    };
    const rawSetCookies =
      typeof headerAny.getSetCookie === 'function'
        ? headerAny.getSetCookie()
        : response.headers.get('set-cookie')
          ? [response.headers.get('set-cookie') as string]
          : [];

    if (!rawSetCookies.length) {
      return fallback;
    }

    const merged = new Map<string, string>();
    const append = (jar: string | null) => {
      if (!jar) {
        return;
      }

      for (const item of jar.split(';')) {
        const trimmed = item.trim();
        if (!trimmed) {
          continue;
        }
        const index = trimmed.indexOf('=');
        if (index <= 0) {
          continue;
        }
        merged.set(trimmed.slice(0, index), trimmed);
      }
    };

    append(fallback);
    for (const cookieHeader of rawSetCookies) {
      const cookies = cookieHeader
        .split(/,(?=[^;]+?=)/)
        .map((entry) => entry.split(';')[0]?.trim())
        .filter(Boolean);
      for (const cookie of cookies) {
        const index = cookie.indexOf('=');
        if (index <= 0) {
          continue;
        }
        merged.set(cookie.slice(0, index), cookie);
      }
    }

    return Array.from(merged.values()).join('; ');
  }

  private resolveUrl(pathOrUrl: string) {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }

    return `${this.baseUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`;
  }

  private get baseUrl() {
    return (
      this.configService.get<string>('LUXPOWER_BASE_URL') ||
      'https://server.luxpowertek.com/WManage'
    ).replace(/\/$/, '');
  }

  private get origin() {
    try {
      return new URL(this.baseUrl).origin;
    } catch {
      return 'https://server.luxpowertek.com';
    }
  }

  private get demoPlantId() {
    return this.configService.get<string>('LUXPOWER_DEMO_PLANT_ID') || '15804';
  }

  private get demoSerial() {
    return this.configService.get<string>('LUXPOWER_DEMO_SERIAL') || '1514025004';
  }
}

function toNullableString(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}
