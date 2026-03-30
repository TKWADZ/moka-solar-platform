import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateWebsiteSettingsDto } from './dto/update-website-settings.dto';

const PUBLIC_SITE_KEY = 'public_site';

@Injectable()
export class WebsiteSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findPublicSite() {
    return this.ensureDefault();
  }

  async updatePublicSite(dto: UpdateWebsiteSettingsDto, actorId: string) {
    const existing = await this.ensureDefault();

    const updated = await this.prisma.websiteSetting.update({
      where: { id: existing.id },
      data: {
        name: dto.name?.trim() || existing.name,
        description:
          dto.description !== undefined
            ? dto.description.trim() || null
            : existing.description,
        content:
          dto.content !== undefined
            ? (dto.content as Prisma.InputJsonValue)
            : existing.content,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'WEBSITE_SETTINGS_UPDATED',
      entityType: 'WebsiteSetting',
      entityId: updated.id,
      payload: {
        key: updated.key,
        name: updated.name,
      },
    });

    return updated;
  }

  private async ensureDefault() {
    const existing = await this.prisma.websiteSetting.findFirst({
      where: {
        key: PUBLIC_SITE_KEY,
        deletedAt: null,
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.websiteSetting.create({
      data: {
        key: PUBLIC_SITE_KEY,
        name: 'Public website settings',
        description:
          'Editable configuration for logo, contact information, pricing cards, FAQ and footer.',
        content: {},
      },
    });
  }
}
