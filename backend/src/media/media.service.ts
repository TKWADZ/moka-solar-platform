import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { slugify } from '../common/helpers/domain.helper';
import { PrismaService } from '../prisma/prisma.service';
import { ListMediaAssetsDto } from './dto/list-media-assets.dto';
import { UpdateMediaAssetDto } from './dto/update-media-asset.dto';

type UploadFileLike = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type UploadMediaPayload = {
  title?: string;
  description?: string;
  altText?: string;
  tags?: string;
  folder?: string;
};

const IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async list(query: ListMediaAssetsDto) {
    const where: Prisma.MediaAssetWhereInput = {
      deletedAt: null,
    };

    if (query.search?.trim()) {
      const value = query.search.trim();
      where.OR = [
        { title: { contains: value, mode: 'insensitive' } },
        { description: { contains: value, mode: 'insensitive' } },
        { altText: { contains: value, mode: 'insensitive' } },
        { originalName: { contains: value, mode: 'insensitive' } },
        { filename: { contains: value, mode: 'insensitive' } },
        { folder: { contains: value, mode: 'insensitive' } },
      ];
    }

    if (query.folder?.trim()) {
      where.folder = query.folder.trim();
    }

    if (query.tag?.trim()) {
      where.tags = {
        has: query.tag.trim(),
      };
    }

    if (query.dateFrom || query.dateTo) {
      const from = query.dateFrom ? new Date(query.dateFrom) : undefined;
      const to = query.dateTo ? new Date(query.dateTo) : undefined;

      if (to) {
        to.setHours(23, 59, 59, 999);
      }

      where.createdAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const items = await this.prisma.mediaAsset.findMany({
      where,
      include: {
        uploadedByUser: {
          include: {
            role: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    return items.map((item) => this.serialize(item));
  }

  async findOne(id: string) {
    const media = await this.prisma.mediaAsset.findFirst({
      where: {
        id,
        deletedAt: null,
      },
      include: {
        uploadedByUser: {
          include: {
            role: true,
          },
        },
      },
    });

    if (!media) {
      throw new NotFoundException('Media asset not found');
    }

    return this.serialize(media);
  }

  async uploadMany(
    files: UploadFileLike[],
    payload: UploadMediaPayload,
    actorId?: string,
  ) {
    if (!files.length) {
      throw new BadRequestException('Please select at least one image to upload');
    }

    const storageRoot = await this.ensureStorageRoot();
    const folder = this.normalizeFolder(payload.folder);
    const tags = this.normalizeTags(payload.tags);
    const createdAt = new Date();
    const year = String(createdAt.getUTCFullYear());
    const month = String(createdAt.getUTCMonth() + 1).padStart(2, '0');
    const relativeDir = path.join('storage', 'media', year, month);
    const absoluteDir = path.join(storageRoot, year, month);

    await fs.mkdir(absoluteDir, { recursive: true });

    const createdAssets = [];

    for (const file of files) {
      this.assertImage(file);

      const extension = this.resolveExtension(file.originalname, file.mimetype);
      const baseName = slugify(path.parse(file.originalname).name) || 'image';
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${extension}`;
      const absolutePath = path.join(absoluteDir, storedName);
      const relativePath = path.join(relativeDir, storedName).replace(/\\/g, '/');

      await fs.writeFile(absolutePath, file.buffer);

      const record = await this.prisma.mediaAsset.create({
        data: {
          filename: storedName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath: relativePath,
          title:
            files.length === 1
              ? payload.title?.trim() || path.parse(file.originalname).name
              : path.parse(file.originalname).name,
          description: payload.description?.trim() || null,
          altText: payload.altText?.trim() || null,
          tags,
          folder,
          uploadedByUserId: actorId || null,
        },
        include: {
          uploadedByUser: {
            include: {
              role: true,
            },
          },
        },
      });

      createdAssets.push(this.serialize(record));
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MEDIA_UPLOADED',
      entityType: 'MediaAsset',
      payload: {
        count: createdAssets.length,
        folder,
        tags,
      },
    });

    return createdAssets;
  }

  async update(id: string, dto: UpdateMediaAssetDto, actorId?: string) {
    await this.findOne(id);

    const updated = await this.prisma.mediaAsset.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() || null } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.altText !== undefined ? { altText: dto.altText.trim() || null } : {}),
        ...(dto.folder !== undefined ? { folder: this.normalizeFolder(dto.folder) } : {}),
        tags:
          dto.tags === undefined
            ? undefined
            : this.normalizeTags(dto.tags),
      },
      include: {
        uploadedByUser: {
          include: {
            role: true,
          },
        },
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MEDIA_UPDATED',
      entityType: 'MediaAsset',
      entityId: id,
      payload: dto as unknown as Record<string, unknown>,
    });

    return this.serialize(updated);
  }

  async remove(id: string, actorId?: string) {
    const media = await this.findOne(id);
    const absolutePath = path.resolve(process.cwd(), media.storagePath);

    await this.prisma.mediaAsset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await fs.unlink(absolutePath).catch(() => undefined);

    await this.auditLogsService.log({
      userId: actorId,
      action: 'MEDIA_DELETED',
      entityType: 'MediaAsset',
      entityId: id,
      payload: {
        storagePath: media.storagePath,
      },
    });

    return { success: true };
  }

  async resolveFile(id: string) {
    const media = await this.findOne(id);
    const absolutePath = path.resolve(process.cwd(), media.storagePath);

    await fs.access(absolutePath).catch(() => {
      throw new NotFoundException('Stored media file not found');
    });

    return {
      filePath: absolutePath,
      mimeType: media.mimeType,
      originalName: media.originalName,
    };
  }

  private async ensureStorageRoot() {
    const root = path.resolve(
      process.cwd(),
      process.env.MEDIA_STORAGE_DIR || path.join('storage', 'media'),
    );

    await fs.mkdir(root, { recursive: true });
    return root;
  }

  private assertImage(file: UploadFileLike) {
    if (!IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only image files are allowed');
    }
  }

  private resolveExtension(originalName: string, mimeType: string) {
    const fromOriginal = path.extname(originalName).toLowerCase();

    if (fromOriginal) {
      return fromOriginal;
    }

    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'image/gif':
        return '.gif';
      case 'image/svg+xml':
        return '.svg';
      default:
        return '';
    }
  }

  private normalizeFolder(value?: string) {
    const normalized = value?.trim();
    return normalized ? normalized.slice(0, 80) : null;
  }

  private normalizeTags(value?: string | string[]) {
    const items = Array.isArray(value)
      ? value
      : value?.split(',') ?? [];

    if (!items.length) {
      return [];
    }

    return Array.from(
      new Set(
        items
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).slice(0, 20);
  }

  private serialize<T extends Record<string, any>>(item: T) {
    return {
      ...item,
      fileUrl: `/api/media/${item.id}/file`,
      previewUrl: `/api/media/${item.id}/file`,
    };
  }
}
