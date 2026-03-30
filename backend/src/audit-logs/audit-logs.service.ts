import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async log(entry: {
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string | null;
    payload?: Record<string, unknown>;
  }) {
    if (!entry.userId) {
      return null;
    }

    return this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId || null,
        payload: (entry.payload ?? Prisma.JsonNull) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
      },
    });
  }

  findAll(limit = 50) {
    return this.prisma.auditLog.findMany({
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
