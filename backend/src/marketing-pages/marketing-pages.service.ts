import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DefaultMarketingPage,
  buildDefaultMarketingPages,
} from './default-marketing-pages';
import { UpdateMarketingPageDto } from './dto/update-marketing-page.dto';

const copyCleanupMap: Array<[string, string]> = [
  ['Open demo workspace', 'Đăng nhập'],
  ['Mở demo workspace', 'Đăng nhập'],
  ['Start demo', 'Nhận tư vấn'],
  ['Tạo tài khoản demo', 'Yêu cầu tư vấn'],
  ['Create demo account', 'Request consultation'],
  ['Create a demo account', 'Request consultation'],
  ['Create a demo customer account', 'Request account'],
  ['Open live portal', 'Đăng nhập'],
  ['Open live portals', 'Đăng nhập'],
  ['Mở các portal vận hành', 'Đăng nhập'],
  ['https://www.tesla.com/energy', '/solutions'],
  ['Xem cảm hứng Tesla Energy', 'Xem giải pháp triển khai'],
  ['See Tesla Energy reference', 'Explore solution tracks'],
  [
    'Bản public hiện đi gần hơn với một premium energy brand thay vì một bản demo SaaS.',
    'Trải nghiệm công khai đã được tinh gọn để phù hợp một thương hiệu năng lượng cao cấp và đáng tin cậy.',
  ],
  [
    'The public experience now feels closer to a premium energy brand than a generic SaaS demo.',
    'The public experience is now cleaner, calmer and more credible for a real energy brand.',
  ],
  [
    'Đặt lịch demo nền tảng cho đội sales, tài chính và vận hành điện mặt trời của bạn.',
    'Trao đổi giải pháp vận hành, billing và cổng khách hàng cho danh mục điện mặt trời của bạn.',
  ],
  [
    'Book a platform demo for your solar sales, finance and operations teams.',
    'Talk to Moka Solar about operating, billing and customer service for your solar portfolio.',
  ],
];

@Injectable()
export class MarketingPagesService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  async findAll() {
    await this.ensureDefaults();

    const pages = await this.prisma.marketingPage.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return pages.map((page) => this.sanitizePage(page));
  }

  async findPublished() {
    await this.ensureDefaults();

    const pages = await this.prisma.marketingPage.findMany({
      where: {
        deletedAt: null,
        published: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    return pages.map((page) => this.sanitizePage(page));
  }

  async findOne(key: string) {
    await this.ensureDefaults();

    const page = await this.prisma.marketingPage.findFirst({
      where: {
        key,
        deletedAt: null,
      },
    });

    if (!page) {
      throw new NotFoundException('Marketing page not found');
    }

    return this.sanitizePage(page);
  }

  async findPublishedByKey(key: string) {
    await this.ensureDefaults();

    const page = await this.prisma.marketingPage.findFirst({
      where: {
        key,
        deletedAt: null,
        published: true,
      },
    });

    if (!page) {
      throw new NotFoundException('Marketing page not found');
    }

    return this.sanitizePage(page);
  }

  async update(key: string, dto: UpdateMarketingPageDto, actorId: string) {
    await this.ensureDefaults();

    const existing = await this.findOne(key);
    const nextContent =
      dto.content !== undefined && dto.content !== null
        ? (this.sanitizeContent(dto.content) as Prisma.InputJsonValue)
        : existing.content;

    const updated = await this.prisma.marketingPage.update({
      where: { id: existing.id },
      data: {
        name: dto.name?.trim() || existing.name,
        description:
          dto.description !== undefined && dto.description !== null
            ? dto.description.trim() || null
            : existing.description,
        published: dto.published ?? existing.published,
        content: nextContent,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MARKETING_PAGE_UPDATED',
      entityType: 'MarketingPage',
      entityId: updated.id,
      payload: {
        key: updated.key,
        name: updated.name,
        published: updated.published,
      },
    });

    return this.sanitizePage(updated);
  }

  private async ensureDefaults() {
    const defaults = buildDefaultMarketingPages();

    for (const page of defaults) {
      await this.upsertDefault(page);
    }
  }

  private async upsertDefault(page: DefaultMarketingPage) {
    const existing = await this.prisma.marketingPage.findUnique({
      where: { key: page.key },
      select: { id: true },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.marketingPage.create({
      data: {
        key: page.key,
        name: page.name,
        description: page.description,
        published: page.published,
        sortOrder: page.sortOrder,
        content: this.sanitizeContent(page.content) as Prisma.InputJsonValue,
      },
    });
  }

  private sanitizePage<T extends { name?: string | null; description?: string | null; content: unknown }>(page: T): T {
    return {
      ...page,
      name:
        typeof page.name === 'string'
          ? this.sanitizeContent(page.name)
          : page.name,
      description:
        typeof page.description === 'string'
          ? this.sanitizeContent(page.description)
          : page.description,
      content: this.sanitizeContent(page.content),
    };
  }

  private sanitizeContent<T>(value: T): T {
    if (typeof value === 'string') {
      return copyCleanupMap.reduce(
        (output, [from, to]) => output.replaceAll(from, to),
        value,
      ) as T;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeContent(item)) as T;
    }

    if (this.isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          this.sanitizeContent(item),
        ]),
      ) as T;
    }

    return value;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
}
