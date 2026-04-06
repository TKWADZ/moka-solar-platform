import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { RealtimeEventsService } from './realtime-events.service';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtimeEventsService: RealtimeEventsService,
  ) {}

  async findMine(userId: string, limit = 25) {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: Math.max(1, Math.min(limit, 100)),
    });

    return items.map((item) => this.serialize(item));
  }

  async getUnreadSummary(userId: string) {
    const unreadCount = await this.prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });

    return {
      unreadCount,
    };
  }

  async create(dto: CreateNotificationDto) {
    const created = await this.prisma.notification.create({
      data: {
        userId: dto.userId,
        type: dto.type || NotificationType.GENERAL,
        title: dto.title,
        body: dto.body,
        entityType: dto.entityType || null,
        entityId: dto.entityId || null,
        linkHref: dto.linkHref || null,
        metadata:
          dto.metadata === undefined
            ? Prisma.JsonNull
            : (dto.metadata as Prisma.InputJsonValue),
      },
    });

    const serialized = this.serialize(created);
    await this.emitNotificationCreated(serialized.userId, serialized);
    return serialized;
  }

  async createMany(userIds: string[], dto: Omit<CreateNotificationDto, 'userId'>) {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (!uniqueUserIds.length) {
      return [];
    }

    const createdAt = new Date();

    await this.prisma.notification.createMany({
      data: uniqueUserIds.map((userId) => ({
        userId,
        type: dto.type || NotificationType.GENERAL,
        title: dto.title,
        body: dto.body,
        entityType: dto.entityType || null,
        entityId: dto.entityId || null,
        linkHref: dto.linkHref || null,
        metadata:
          dto.metadata === undefined
            ? Prisma.JsonNull
            : (dto.metadata as Prisma.InputJsonValue),
        createdAt,
      })),
    });

    const created = await this.prisma.notification.findMany({
      where: {
        userId: { in: uniqueUserIds },
        createdAt,
        title: dto.title,
      },
      orderBy: { createdAt: 'desc' },
    });

    const serialized = created.map((item) => this.serialize(item));
    await Promise.all(
      serialized.map((item) => this.emitNotificationCreated(item.userId, item)),
    );

    return serialized;
  }

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    const updated = await this.prisma.notification.update({
      where: { id },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    const summary = await this.getUnreadSummary(userId);
    this.realtimeEventsService.emitToUser(userId, 'notification.unread-summary', summary);
    return this.serialize(updated);
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });

    const summary = await this.getUnreadSummary(userId);
    this.realtimeEventsService.emitToUser(userId, 'notification.unread-summary', summary);
    return summary;
  }

  private async emitNotificationCreated(userId: string, notification: ReturnType<NotificationsService['serialize']>) {
    const summary = await this.getUnreadSummary(userId);

    this.realtimeEventsService.emitToUser(userId, 'notification.created', {
      notification,
    });
    this.realtimeEventsService.emitToUser(userId, 'notification.unread-summary', summary);
  }

  private serialize<T extends Prisma.NotificationGetPayload<Record<string, never>>>(item: T) {
    return {
      ...item,
      metadata: item.metadata ?? null,
    };
  }
}
