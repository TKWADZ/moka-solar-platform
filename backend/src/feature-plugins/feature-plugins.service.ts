import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildDefaultFeaturePlugins } from './default-feature-plugins';
import { CreateFeaturePluginDto } from './dto/create-feature-plugin.dto';
import { UpdateFeaturePluginDto } from './dto/update-feature-plugin.dto';

@Injectable()
export class FeaturePluginsService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async onModuleInit() {
    await this.syncDefaults();
  }

  async syncDefaults(actorId?: string) {
    const defaults = buildDefaultFeaturePlugins();
    const existing = await this.prisma.featurePlugin.findMany({
      where: {
        deletedAt: null,
        key: {
          in: defaults.map((plugin) => plugin.key),
        },
      },
      select: { key: true },
    });

    const existingKeys = new Set(existing.map((item) => item.key));
    const missing = defaults.filter((plugin) => !existingKeys.has(plugin.key));

    if (missing.length) {
      await this.prisma.featurePlugin.createMany({
        data: missing.map((plugin) => ({
          ...plugin,
          config: plugin.config as Prisma.InputJsonValue,
        })),
      });
    }

    if (actorId) {
      await this.auditLogsService.log({
        userId: actorId,
        action: 'FEATURE_PLUGIN_DEFAULTS_SYNCED',
        entityType: 'FeaturePlugin',
        payload: {
          createdKeys: missing.map((plugin) => plugin.key),
        },
      });
    }

    return this.findAll();
  }

  findAll() {
    return this.prisma.featurePlugin.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  findCatalog() {
    return this.prisma.featurePlugin.findMany({
      where: {
        deletedAt: null,
        installed: true,
        enabled: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const plugin = await this.prisma.featurePlugin.findFirst({
      where: { id, deletedAt: null },
    });

    if (!plugin) {
      throw new NotFoundException('Feature plugin not found');
    }

    return plugin;
  }

  async findByKey(key: string) {
    const plugin = await this.prisma.featurePlugin.findFirst({
      where: { key, deletedAt: null },
    });

    if (!plugin) {
      throw new NotFoundException(`Feature plugin "${key}" not found`);
    }

    return plugin;
  }

  async assertActive(key: string) {
    const plugin = await this.findByKey(key);

    if (!plugin.installed || !plugin.enabled) {
      throw new ServiceUnavailableException({
        message: `Feature plugin "${key}" is disabled`,
        pluginKey: key,
        installed: plugin.installed,
        enabled: plugin.enabled,
      });
    }

    return plugin;
  }

  async create(dto: CreateFeaturePluginDto, actorId?: string) {
    const plugin = await this.prisma.featurePlugin.create({
      data: {
        ...dto,
        config: dto.config as Prisma.InputJsonValue | undefined,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'FEATURE_PLUGIN_CREATED',
      entityType: 'FeaturePlugin',
      entityId: plugin.id,
      payload: this.toAuditPayload(dto),
    });

    return plugin;
  }

  async update(id: string, dto: UpdateFeaturePluginDto, actorId?: string) {
    const existing = await this.findOne(id);

    if (existing.isCore && (dto.enabled === false || dto.installed === false)) {
      throw new BadRequestException('Core plugins cannot be disabled or uninstalled');
    }

    if (!existing.editable && Object.keys(dto).length > 0) {
      throw new BadRequestException('This plugin is locked from manual edits');
    }

    const plugin = await this.prisma.featurePlugin.update({
      where: { id },
      data: {
        ...dto,
        config: dto.config as Prisma.InputJsonValue | undefined,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'FEATURE_PLUGIN_UPDATED',
      entityType: 'FeaturePlugin',
      entityId: plugin.id,
      payload: this.toAuditPayload(dto),
    });

    return plugin;
  }

  async remove(id: string, actorId?: string) {
    const existing = await this.findOne(id);

    if (existing.isCore) {
      throw new BadRequestException('Core plugins cannot be removed');
    }

    await this.prisma.featurePlugin.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'FEATURE_PLUGIN_ARCHIVED',
      entityType: 'FeaturePlugin',
      entityId: id,
    });

    return { success: true };
  }

  private toAuditPayload(dto: CreateFeaturePluginDto | UpdateFeaturePluginDto) {
    return JSON.parse(JSON.stringify(dto)) as Record<string, unknown>;
  }
}
