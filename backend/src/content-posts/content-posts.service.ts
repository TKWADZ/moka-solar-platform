import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ContentPostStatus } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { slugify } from '../common/helpers/domain.helper';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContentPostDto } from './dto/create-content-post.dto';
import { UpdateContentPostDto } from './dto/update-content-post.dto';

@Injectable()
export class ContentPostsService {
  constructor(
    private prisma: PrismaService,
    private auditLogsService: AuditLogsService,
  ) {}

  findAll() {
    return this.prisma.contentPost.findMany({
      where: { deletedAt: null },
      include: {
        author: {
          include: {
            role: true,
          },
        },
      },
      orderBy: [{ isFeatured: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  findPublished() {
    return this.prisma.contentPost.findMany({
      where: {
        deletedAt: null,
        status: ContentPostStatus.PUBLISHED,
      },
      include: {
        author: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: [{ isFeatured: 'desc' }, { publishedAt: 'desc' }],
    });
  }

  async findPublishedBySlug(slug: string) {
    const post = await this.prisma.contentPost.findFirst({
      where: {
        slug,
        deletedAt: null,
        status: ContentPostStatus.PUBLISHED,
      },
      include: {
        author: {
          select: {
            fullName: true,
            email: true,
          },
        },
      },
    });

    if (!post) {
      throw new NotFoundException('Content post not found');
    }

    return post;
  }

  async create(dto: CreateContentPostDto, actorId: string) {
    const slug = await this.ensureUniqueSlug(dto.slug || dto.title);
    const status = dto.status || ContentPostStatus.DRAFT;
    const publishedAt = this.resolvePublishedAt(status, dto.publishedAt);

    const post = await this.prisma.contentPost.create({
      data: {
        authorId: actorId,
        title: dto.title.trim(),
        slug,
        excerpt: dto.excerpt?.trim(),
        content: dto.content.trim(),
        coverImageUrl: dto.coverImageUrl?.trim(),
        tags: (dto.tags || []).map((tag) => tag.trim()).filter(Boolean),
        status,
        isFeatured: Boolean(dto.isFeatured),
        publishedAt,
      },
      include: {
        author: {
          include: {
            role: true,
          },
        },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CONTENT_POST_CREATED',
      entityType: 'ContentPost',
      entityId: post.id,
      payload: {
        title: post.title,
        status: post.status,
        slug: post.slug,
      },
    });

    return post;
  }

  async update(id: string, dto: UpdateContentPostDto, actorId: string) {
    const existing = await this.prisma.contentPost.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Content post not found');
    }

    const nextTitle = dto.title?.trim() || existing.title;
    const shouldRefreshSlug =
      (!!dto.slug && dto.slug !== existing.slug) ||
      (!!dto.title && !dto.slug && existing.slug === slugify(existing.title));
    const slug = shouldRefreshSlug
      ? await this.ensureUniqueSlug(dto.slug || nextTitle, id)
      : existing.slug;
    const status = dto.status || existing.status;
    const publishedAt = this.resolvePublishedAt(
      status,
      dto.publishedAt === null ? null : dto.publishedAt || existing.publishedAt,
      existing.publishedAt,
    );

    const updated = await this.prisma.contentPost.update({
      where: { id },
      data: {
        title: nextTitle,
        slug,
        excerpt:
          dto.excerpt !== undefined ? dto.excerpt?.trim() || null : existing.excerpt,
        content: dto.content?.trim() || existing.content,
        coverImageUrl:
          dto.coverImageUrl !== undefined
            ? dto.coverImageUrl?.trim() || null
            : existing.coverImageUrl,
        tags:
          dto.tags !== undefined
            ? dto.tags.map((tag) => tag.trim()).filter(Boolean)
            : existing.tags,
        status,
        isFeatured:
          dto.isFeatured !== undefined ? dto.isFeatured : existing.isFeatured,
        publishedAt,
      },
      include: {
        author: {
          include: {
            role: true,
          },
        },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CONTENT_POST_UPDATED',
      entityType: 'ContentPost',
      entityId: updated.id,
      payload: {
        title: updated.title,
        status: updated.status,
        slug: updated.slug,
      },
    });

    return updated;
  }

  async remove(id: string, actorId: string) {
    const existing = await this.prisma.contentPost.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException('Content post not found');
    }

    await this.prisma.contentPost.update({
      where: { id },
      data: { deletedAt: new Date(), status: ContentPostStatus.ARCHIVED },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'CONTENT_POST_ARCHIVED',
      entityType: 'ContentPost',
      entityId: id,
      payload: {
        title: existing.title,
      },
    });

    return { success: true };
  }

  private async ensureUniqueSlug(rawValue: string, excludeId?: string) {
    const base = slugify(rawValue);

    if (!base) {
      throw new BadRequestException('A valid title or slug is required');
    }

    let slug = base;
    let suffix = 2;

    while (true) {
      const match = await this.prisma.contentPost.findFirst({
        where: {
          slug,
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      });

      if (!match) {
        return slug;
      }

      slug = `${base}-${suffix}`;
      suffix += 1;
    }
  }

  private resolvePublishedAt(
    status: ContentPostStatus,
    input?: string | Date | null,
    existing?: Date | null,
  ) {
    if (status !== ContentPostStatus.PUBLISHED) {
      return input === null ? null : existing || null;
    }

    if (input instanceof Date) {
      return input;
    }

    if (typeof input === 'string' && input.trim()) {
      return new Date(input);
    }

    return existing || new Date();
  }
}
