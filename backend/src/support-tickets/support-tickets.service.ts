import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  TicketMessageType,
  TicketStatus,
} from '@prisma/client';
import { promises as fs } from 'fs';
import * as path from 'path';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { hasPermission } from '../common/auth/permissions';
import { generateCode, slugify } from '../common/helpers/domain.helper';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEventsService } from '../notifications/realtime-events.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListSupportTicketsDto } from './dto/list-support-tickets.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';

type UploadAttachmentFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const MAX_TICKET_ATTACHMENT_FILE_SIZE = 8 * 1024 * 1024;
const TICKET_ATTACHMENT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
]);

const STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Mới',
  IN_PROGRESS: 'Đang xử lý',
  RESOLVED: 'Đã giải quyết',
  CLOSED: 'Đã đóng',
};

@Injectable()
export class SupportTicketsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeEventsService: RealtimeEventsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async findAll(query: ListSupportTicketsDto) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: this.buildAdminWhere(query),
      include: this.ticketInclude(),
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    });

    return tickets.map((ticket) => this.serializeTicket(ticket, 'STAFF'));
  }

  async findMine(customerId: string) {
    const tickets = await this.prisma.supportTicket.findMany({
      where: {
        customerId,
        deletedAt: null,
      },
      include: this.ticketInclude(),
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    });

    return tickets.map((ticket) => this.serializeTicket(ticket, 'CUSTOMER'));
  }

  async findOne(ticketId: string, user: AuthenticatedUser) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        deletedAt: null,
      },
      include: this.ticketInclude(),
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    this.assertTicketAccess(ticket, user);
    return this.serializeTicket(ticket, user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF');
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateTicketDto,
    attachments: UploadAttachmentFile[] = [],
  ) {
    if (user.role !== 'CUSTOMER' || !user.customerId) {
      throw new ForbiddenException('Only customer accounts can create tickets');
    }

    const subject = dto.subject?.trim() || dto.title?.trim();
    const initialMessage = dto.message?.trim() || dto.description?.trim();

    if (!subject) {
      throw new BadRequestException('Vui lòng nhập tiêu đề yêu cầu hỗ trợ.');
    }

    if (!initialMessage) {
      throw new BadRequestException('Vui lòng nhập nội dung ticket.');
    }

    attachments.forEach((file) => this.assertAttachment(file));

    let solarSystemId: string | null = null;
    if (dto.solarSystemId?.trim()) {
      const system = await this.prisma.solarSystem.findFirst({
        where: {
          id: dto.solarSystemId.trim(),
          customerId: user.customerId,
          deletedAt: null,
        },
      });

      if (!system) {
        throw new BadRequestException('Không tìm thấy hệ thống phù hợp cho ticket này.');
      }

      solarSystemId = system.id;
    }

    const now = new Date();
    const created = await this.prisma.supportTicket.create({
      data: {
        ticketNumber: generateCode('TCK'),
        customerId: user.customerId,
        solarSystemId,
        title: subject,
        description: initialMessage,
        category: dto.category || 'GENERAL',
        priority: dto.priority || 'MEDIUM',
        customerLastReadAt: now,
        lastMessageAt: now,
        lastCustomerMessageAt: now,
        lastHandledByUserId: user.sub,
        participants: {
          create: {
            userId: user.sub,
            participantType: 'CUSTOMER',
          },
        },
        messages: {
          create: {
            senderUserId: user.sub,
            senderName: user.email,
            senderRole: user.role,
            message: initialMessage,
          },
        },
      },
      include: this.ticketInclude(),
    });

    if (attachments.length) {
      const initialMessageRecord = created.messages[0];
      await this.storeAttachments(created.id, initialMessageRecord.id, user.sub, attachments);
    }

    const hydrated = await this.requireTicket(created.id);
    const staffRecipients = await this.getSupportRecipientIds();

    await this.notificationsService.createMany(staffRecipients, {
      type: NotificationType.TICKET_CREATED,
      title: 'Có ticket mới từ khách hàng',
      body: `${hydrated.customer?.companyName || hydrated.customer?.user?.fullName || 'Khách hàng'} vừa tạo ticket ${hydrated.ticketNumber || hydrated.title}.`,
      entityType: 'SupportTicket',
      entityId: hydrated.id,
      linkHref: '/admin/support',
      metadata: {
        ticketId: hydrated.id,
        status: hydrated.status,
        priority: hydrated.priority,
      },
    });

    this.realtimeEventsService.emitToUsers(staffRecipients, 'ticket.created', {
      ticketId: hydrated.id,
      ticketNumber: hydrated.ticketNumber,
      title: hydrated.title,
      status: hydrated.status,
      priority: hydrated.priority,
    });

    await this.auditLogsService.log({
      userId: user.sub,
      action: 'SUPPORT_TICKET_CREATED',
      moduleKey: 'support',
      entityType: 'SupportTicket',
      entityId: hydrated.id,
      payload: {
        category: hydrated.category,
        priority: hydrated.priority,
        solarSystemId,
      },
      afterState: this.serializeTicketAuditState(hydrated),
    });

    await this.auditLogsService.touchEntity({
      entityType: 'SupportTicket',
      entityId: hydrated.id,
      actorId: user.sub,
      moduleKey: 'support',
    });

    return this.serializeTicket(hydrated, 'CUSTOMER');
  }

  async reply(
    ticketId: string,
    user: AuthenticatedUser,
    dto: ReplyTicketDto,
    attachments: UploadAttachmentFile[] = [],
  ) {
    const messageBody = dto.message?.trim();

    if (!messageBody) {
      throw new BadRequestException('Vui lòng nhập nội dung phản hồi.');
    }

    attachments.forEach((file) => this.assertAttachment(file));

    const ticket = await this.requireTicket(ticketId);
    this.assertTicketAccess(ticket, user);

    if (
      Boolean(dto.isInternal) &&
      user.role !== 'CUSTOMER' &&
      !hasPermission(user.permissions, 'support.internal_notes')
    ) {
      throw new ForbiddenException('Báº¡n khÃ´ng cÃ³ quyá»n lÆ°u ghi chÃº ná»™i bá»™.');
    }

    const isInternal = Boolean(dto.isInternal);
    if (isInternal && user.role === 'CUSTOMER') {
      throw new ForbiddenException('Khách hàng không thể gửi ghi chú nội bộ.');
    }

    const now = new Date();
    const beforeState = this.serializeTicketAuditState(ticket);
    const nextStatus =
      user.role === 'CUSTOMER'
        ? TicketStatus.OPEN
        : isInternal
          ? ticket.status
          : TicketStatus.IN_PROGRESS;

    const createdMessage = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderUserId: user.sub,
        senderName: user.email,
        senderRole: user.role,
        messageType: isInternal ? TicketMessageType.INTERNAL_NOTE : TicketMessageType.MESSAGE,
        isInternal,
        message: messageBody,
      },
    });

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: nextStatus,
        lastMessageAt: now,
        lastHandledByUserId: user.sub,
        ...(user.role === 'CUSTOMER'
          ? {
              lastCustomerMessageAt: isInternal ? ticket.lastCustomerMessageAt : now,
              customerLastReadAt: now,
            }
          : {
              lastStaffMessageAt: isInternal ? ticket.lastStaffMessageAt : now,
              staffLastReadAt: now,
            }),
      },
    });

    await this.upsertParticipant(ticketId, user.sub, user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF');

    if (attachments.length) {
      await this.storeAttachments(ticketId, createdMessage.id, user.sub, attachments);
    }

    const hydrated = await this.requireTicket(ticketId);

    if (user.role === 'CUSTOMER') {
      const staffRecipients = await this.getTicketStaffRecipientIds(hydrated);

      await this.notificationsService.createMany(staffRecipients, {
        type: NotificationType.TICKET_MESSAGE,
        title: 'Ticket có phản hồi mới',
        body: `${hydrated.customer?.companyName || hydrated.customer?.user?.fullName || 'Khách hàng'} vừa trả lời ticket ${hydrated.ticketNumber || hydrated.title}.`,
        entityType: 'SupportTicket',
        entityId: hydrated.id,
        linkHref: '/admin/support',
        metadata: {
          ticketId: hydrated.id,
          status: hydrated.status,
        },
      });

      this.realtimeEventsService.emitToUsers(staffRecipients, 'ticket.message', {
        ticketId: hydrated.id,
        isInternal: false,
        senderRole: user.role,
      });
    } else {
      if (!isInternal) {
        await this.notificationsService.create({
          userId: hydrated.customer.userId,
          type: NotificationType.TICKET_MESSAGE,
          title: 'Ticket được cập nhật',
          body: `Đội vận hành vừa phản hồi ticket ${hydrated.ticketNumber || hydrated.title}.`,
          entityType: 'SupportTicket',
          entityId: hydrated.id,
          linkHref: '/customer/support',
          metadata: {
            ticketId: hydrated.id,
            status: hydrated.status,
          },
        });

        this.realtimeEventsService.emitToUser(hydrated.customer.userId, 'ticket.message', {
          ticketId: hydrated.id,
          isInternal: false,
          senderRole: user.role,
        });
      }

      const staffRecipients = await this.getTicketStaffRecipientIds(hydrated);
      this.realtimeEventsService.emitToUsers(staffRecipients, 'ticket.message', {
        ticketId: hydrated.id,
        isInternal,
        senderRole: user.role,
      });
    }

    await this.auditLogsService.log({
      userId: user.sub,
      action: isInternal ? 'SUPPORT_TICKET_INTERNAL_NOTE' : 'SUPPORT_TICKET_REPLIED',
      moduleKey: 'support',
      entityType: 'SupportTicket',
      entityId: ticketId,
      payload: {
        isInternal,
        attachmentCount: attachments.length,
      },
      beforeState,
      afterState: this.serializeTicketAuditState(hydrated),
    });

    await this.auditLogsService.touchEntity({
      entityType: 'SupportTicket',
      entityId: ticketId,
      actorId: user.sub,
      moduleKey: 'support',
    });

    return this.serializeTicket(hydrated, user.role === 'CUSTOMER' ? 'CUSTOMER' : 'STAFF');
  }

  async updateStatus(ticketId: string, status: TicketStatus, actor: AuthenticatedUser) {
    const ticket = await this.requireTicket(ticketId);

    if (actor.role === 'CUSTOMER') {
      throw new ForbiddenException('Only staff can update ticket status');
    }

    const now = new Date();
    const beforeState = this.serializeTicketAuditState(ticket);
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status,
        closedAt: status === TicketStatus.CLOSED ? now : null,
        lastMessageAt: now,
        lastStaffMessageAt: now,
        staffLastReadAt: now,
        lastHandledByUserId: actor.sub,
      },
    });

    await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderUserId: actor.sub,
        senderName: actor.email,
        senderRole: actor.role,
        messageType: TicketMessageType.STATUS_CHANGE,
        message: `Trạng thái ticket đã được cập nhật thành ${STATUS_LABELS[status]}.`,
      },
    });

    const hydrated = await this.requireTicket(ticketId);

    await this.notificationsService.create({
      userId: hydrated.customer.userId,
      type: NotificationType.TICKET_STATUS,
      title: 'Ticket đổi trạng thái',
      body: `Ticket ${hydrated.ticketNumber || hydrated.title} hiện ở trạng thái ${STATUS_LABELS[status]}.`,
      entityType: 'SupportTicket',
      entityId: hydrated.id,
      linkHref: '/customer/support',
      metadata: {
        ticketId: hydrated.id,
        status,
      },
    });

    const staffRecipients = await this.getTicketStaffRecipientIds(hydrated);
    this.realtimeEventsService.emitToUsers(
      [hydrated.customer.userId, ...staffRecipients],
      'ticket.status',
      {
        ticketId: hydrated.id,
        status,
      },
    );

    await this.auditLogsService.log({
      userId: actor.sub,
      action: 'SUPPORT_TICKET_STATUS_UPDATED',
      moduleKey: 'support',
      entityType: 'SupportTicket',
      entityId: ticketId,
      payload: { status },
      beforeState,
      afterState: this.serializeTicketAuditState(hydrated),
    });

    await this.auditLogsService.touchEntity({
      entityType: 'SupportTicket',
      entityId: ticketId,
      actorId: actor.sub,
      moduleKey: 'support',
    });

    return this.serializeTicket(hydrated, 'STAFF');
  }

  async assign(ticketId: string, dto: AssignTicketDto, actor: AuthenticatedUser) {
    if (actor.role === 'CUSTOMER') {
      throw new ForbiddenException('Only staff can assign tickets');
    }

    const ticket = await this.requireTicket(ticketId);
    let assigneeUserId = dto.assigneeUserId?.trim() || null;

    if (assigneeUserId) {
      const assignee = await this.prisma.user.findFirst({
        where: {
          id: assigneeUserId,
          deletedAt: null,
          role: {
            code: {
              in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'],
            },
          },
        },
        include: { role: true },
      });

      if (!assignee) {
        throw new BadRequestException('Không tìm thấy nhân viên phù hợp để gán ticket.');
      }

      await this.upsertParticipant(ticketId, assignee.id, 'STAFF');
    }

    const now = new Date();
    const beforeState = this.serializeTicketAuditState(ticket);
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assigneeUserId,
        assignedByUserId: assigneeUserId ? actor.sub : null,
        assignedAt: assigneeUserId ? now : null,
        lastMessageAt: now,
        staffLastReadAt: now,
        lastHandledByUserId: actor.sub,
      },
    });

    await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderUserId: actor.sub,
        senderName: actor.email,
        senderRole: actor.role,
        messageType: TicketMessageType.ASSIGNMENT,
        isInternal: true,
        message: assigneeUserId
          ? `Ticket đã được gán cho nhân viên xử lý.`
          : 'Ticket đã được bỏ gán nhân viên xử lý.',
      },
    });

    const hydrated = await this.requireTicket(ticketId);

    if (assigneeUserId) {
      await this.notificationsService.create({
        userId: assigneeUserId,
        type: NotificationType.TICKET_ASSIGNED,
        title: 'Bạn được gán ticket mới',
        body: `Ticket ${hydrated.ticketNumber || hydrated.title} vừa được giao cho bạn xử lý.`,
        entityType: 'SupportTicket',
        entityId: hydrated.id,
        linkHref: '/admin/support',
        metadata: {
          ticketId: hydrated.id,
        },
      });
    }

    const staffRecipients = await this.getTicketStaffRecipientIds(hydrated);
    this.realtimeEventsService.emitToUsers(staffRecipients, 'ticket.assignment', {
      ticketId: hydrated.id,
      assigneeUserId,
    });

    await this.auditLogsService.log({
      userId: actor.sub,
      action: 'SUPPORT_TICKET_ASSIGNED',
      moduleKey: 'support',
      entityType: 'SupportTicket',
      entityId: ticketId,
      payload: {
        assigneeUserId,
      },
      beforeState,
      afterState: this.serializeTicketAuditState(hydrated),
    });

    await this.auditLogsService.assignEntity({
      entityType: 'SupportTicket',
      entityId: ticketId,
      assignedToUserId: assigneeUserId,
      actorId: actor.sub,
      moduleKey: 'support',
    });

    return this.serializeTicket(hydrated, 'STAFF');
  }

  async markRead(ticketId: string, actor: AuthenticatedUser) {
    const ticket = await this.requireTicket(ticketId);
    this.assertTicketAccess(ticket, actor);

    const now = new Date();

    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data:
        actor.role === 'CUSTOMER'
          ? { customerLastReadAt: now }
          : { staffLastReadAt: now },
    });

    if (actor.role !== 'CUSTOMER') {
      await this.upsertParticipant(ticketId, actor.sub, 'STAFF');
    }

    return this.getUnreadSummary(actor);
  }

  async getUnreadSummary(actor: AuthenticatedUser) {
    if (actor.role === 'CUSTOMER') {
      if (!actor.customerId) {
        return { unreadTickets: 0 };
      }

      const unreadTickets = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM "SupportTicket"
        WHERE "deletedAt" IS NULL
          AND "customerId" = ${actor.customerId}
          AND "lastStaffMessageAt" IS NOT NULL
          AND (
            "customerLastReadAt" IS NULL
            OR "lastStaffMessageAt" > "customerLastReadAt"
          )
      `;

      return {
        unreadTickets: Number(unreadTickets[0]?.count || 0),
      };
    }

    const unreadTickets = await this.prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "SupportTicket"
      WHERE "deletedAt" IS NULL
        AND "lastCustomerMessageAt" IS NOT NULL
        AND (
          "staffLastReadAt" IS NULL
          OR "lastCustomerMessageAt" > "staffLastReadAt"
        )
    `;

    return {
      unreadTickets: Number(unreadTickets[0]?.count || 0),
    };
  }

  async resolveAttachment(ticketId: string, attachmentId: string, actor: AuthenticatedUser) {
    const attachment = await this.prisma.ticketAttachment.findFirst({
      where: {
        id: attachmentId,
        ticketId,
      },
      include: {
        ticket: {
          include: {
            customer: true,
          },
        },
        message: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Ticket attachment not found');
    }

    this.assertTicketAccess(attachment.ticket, actor);

    if (actor.role === 'CUSTOMER' && attachment.message?.isInternal) {
      throw new ForbiddenException('You do not have access to this attachment');
    }

    const filePath = path.resolve(process.cwd(), attachment.storagePath);
    await fs.access(filePath).catch(() => {
      throw new NotFoundException('Stored attachment file not found');
    });

    return {
      filePath,
      mimeType: attachment.mimeType || 'application/octet-stream',
      originalName: attachment.originalName,
    };
  }

  private buildAdminWhere(query: ListSupportTicketsDto): Prisma.SupportTicketWhereInput {
    const where: Prisma.SupportTicketWhereInput = {
      deletedAt: null,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.customerId?.trim()) {
      where.customerId = query.customerId.trim();
    }

    if (query.assigneeUserId?.trim()) {
      where.assigneeUserId = query.assigneeUserId.trim();
    }

    if (query.solarSystemId?.trim()) {
      where.solarSystemId = query.solarSystemId.trim();
    }

    if (query.search?.trim()) {
      const value = query.search.trim();
      where.OR = [
        { title: { contains: value, mode: 'insensitive' } },
        { description: { contains: value, mode: 'insensitive' } },
        { ticketNumber: { contains: value, mode: 'insensitive' } },
        { customer: { companyName: { contains: value, mode: 'insensitive' } } },
        { customer: { user: { fullName: { contains: value, mode: 'insensitive' } } } },
      ];
    }

    return where;
  }

  private ticketInclude() {
    return {
      customer: {
        include: {
          user: true,
        },
      },
      solarSystem: true,
      assigneeUser: {
        include: {
          role: true,
        },
      },
      assignedByUser: {
        include: {
          role: true,
        },
      },
      lastHandledByUser: {
        include: {
          role: true,
        },
      },
      participants: {
        include: {
          user: {
            include: {
              role: true,
            },
          },
        },
        orderBy: {
          joinedAt: 'asc' as const,
        },
      },
      attachments: {
        orderBy: {
          createdAt: 'asc' as const,
        },
      },
      messages: {
        include: {
          senderUser: {
            include: {
              role: true,
            },
          },
          attachments: {
            orderBy: {
              createdAt: 'asc' as const,
            },
          },
        },
        orderBy: {
          createdAt: 'asc' as const,
        },
      },
    };
  }

  private async requireTicket(ticketId: string) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        deletedAt: null,
      },
      include: this.ticketInclude(),
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    return ticket;
  }

  private assertTicketAccess(ticket: any, user: AuthenticatedUser) {
    if (user.role === 'CUSTOMER' && ticket.customerId !== user.customerId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }
  }

  private async upsertParticipant(
    ticketId: string,
    userId: string,
    participantType: 'CUSTOMER' | 'STAFF' | 'WATCHER',
  ) {
    await this.prisma.ticketParticipant.upsert({
      where: {
        ticketId_userId: {
          ticketId,
          userId,
        },
      },
      update: {
        participantType,
      },
      create: {
        ticketId,
        userId,
        participantType,
      },
    });
  }

  private async getSupportRecipientIds() {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        role: {
          code: {
            in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF'],
          },
        },
      },
      select: {
        id: true,
      },
    });

    return users.map((user) => user.id);
  }

  private async getTicketStaffRecipientIds(ticket: any) {
    const supportUserIds = await this.getSupportRecipientIds();
    const participantUserIds = (ticket.participants || [])
      .filter((item: any) => item.participantType !== 'CUSTOMER')
      .map((item: any) => item.userId);

    return Array.from(
      new Set([
        ...supportUserIds,
        ...participantUserIds,
        ticket.assigneeUserId,
      ].filter(Boolean)),
    );
  }

  private async storeAttachments(
    ticketId: string,
    messageId: string,
    uploadedByUserId: string,
    files: UploadAttachmentFile[],
  ) {
    if (!files.length) {
      return [];
    }

    const storageRoot = path.resolve(
      process.cwd(),
      process.env.TICKET_ATTACHMENT_STORAGE_DIR || path.join('storage', 'ticket-attachments'),
    );
    const now = new Date();
    const year = String(now.getUTCFullYear());
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const relativeDir = path.join('storage', 'ticket-attachments', year, month);
    const absoluteDir = path.join(storageRoot, year, month);

    await fs.mkdir(absoluteDir, { recursive: true });

    const created: any[] = [];

    for (const file of files) {
      const extension =
        path.extname(file.originalname).toLowerCase() || this.resolveAttachmentExtension(file.mimetype);
      const baseName = slugify(path.parse(file.originalname).name) || 'ticket-attachment';
      const storedName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${baseName}${extension}`;
      const absolutePath = path.join(absoluteDir, storedName);
      const storagePath = path.join(relativeDir, storedName).replace(/\\/g, '/');

      await fs.writeFile(absolutePath, file.buffer);

      const attachment = await this.prisma.ticketAttachment.create({
        data: {
          ticketId,
          messageId,
          uploadedByUserId,
          originalName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
          storagePath,
        },
      });

      created.push(attachment);
    }

    return created;
  }

  private assertAttachment(file: UploadAttachmentFile) {
    if (!TICKET_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Attachment chỉ hỗ trợ ảnh, PDF, Word, Excel, CSV, TXT hoặc ZIP.',
      );
    }

    if (file.size > MAX_TICKET_ATTACHMENT_FILE_SIZE) {
      throw new BadRequestException('Mỗi attachment không được vượt quá 8 MB.');
    }
  }

  private resolveAttachmentExtension(mimeType: string) {
    switch (mimeType) {
      case 'image/jpeg':
        return '.jpg';
      case 'image/png':
        return '.png';
      case 'image/webp':
        return '.webp';
      case 'application/pdf':
        return '.pdf';
      case 'text/plain':
        return '.txt';
      case 'text/csv':
        return '.csv';
      case 'application/zip':
      case 'application/x-zip-compressed':
        return '.zip';
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return '.docx';
      case 'application/msword':
        return '.doc';
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return '.xlsx';
      case 'application/vnd.ms-excel':
        return '.xls';
      default:
        return '';
    }
  }

  private serializeTicket(ticket: any, audience: 'CUSTOMER' | 'STAFF') {
    const internalMessageIds = new Set(
      (ticket.messages || [])
        .filter((message: any) => message.isInternal)
        .map((message: any) => message.id),
    );
    const messages = (ticket.messages || []).filter(
      (message: any) => audience === 'STAFF' || !message.isInternal,
    );

    const attachments = (ticket.attachments || []).filter(
      (attachment: any) =>
        audience === 'STAFF' || !internalMessageIds.has(attachment.messageId),
    );

    const unreadForCustomer = Boolean(
      ticket.lastStaffMessageAt &&
        (!ticket.customerLastReadAt ||
          new Date(ticket.lastStaffMessageAt).getTime() >
            new Date(ticket.customerLastReadAt).getTime()),
    );
    const unreadForStaff = Boolean(
      ticket.lastCustomerMessageAt &&
        (!ticket.staffLastReadAt ||
          new Date(ticket.lastCustomerMessageAt).getTime() >
            new Date(ticket.staffLastReadAt).getTime()),
    );

    const lastVisibleMessage = [...messages].reverse()[0] || null;

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      title: ticket.title,
      subject: ticket.title,
      description: ticket.description,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      closedAt: ticket.closedAt,
      customerLastReadAt: ticket.customerLastReadAt,
      staffLastReadAt: ticket.staffLastReadAt,
      unreadForCustomer,
      unreadForStaff,
      unread: audience === 'CUSTOMER' ? unreadForCustomer : unreadForStaff,
      customer: ticket.customer
        ? {
            id: ticket.customer.id,
            customerCode: ticket.customer.customerCode,
            companyName: ticket.customer.companyName,
            user: ticket.customer.user
              ? {
                  id: ticket.customer.user.id,
                  fullName: ticket.customer.user.fullName,
                  email: ticket.customer.user.email,
                  phone: ticket.customer.user.phone,
                }
              : null,
          }
        : null,
      solarSystem: ticket.solarSystem
        ? {
            id: ticket.solarSystem.id,
            systemCode: ticket.solarSystem.systemCode,
            name: ticket.solarSystem.name,
            status: ticket.solarSystem.status,
          }
        : null,
      assigneeUser: ticket.assigneeUser
        ? {
            id: ticket.assigneeUser.id,
            fullName: ticket.assigneeUser.fullName,
            email: ticket.assigneeUser.email,
            role: ticket.assigneeUser.role,
          }
        : null,
      assignment: {
        assignedTo: ticket.assigneeUser
          ? {
              id: ticket.assigneeUser.id,
              fullName: ticket.assigneeUser.fullName,
              email: ticket.assigneeUser.email,
              role: ticket.assigneeUser.role,
            }
          : null,
        assignedBy: ticket.assignedByUser
          ? {
              id: ticket.assignedByUser.id,
              fullName: ticket.assignedByUser.fullName,
              email: ticket.assignedByUser.email,
              role: ticket.assignedByUser.role,
            }
          : null,
        assignedAt: ticket.assignedAt,
        lastHandledBy: ticket.lastHandledByUser
          ? {
              id: ticket.lastHandledByUser.id,
              fullName: ticket.lastHandledByUser.fullName,
              email: ticket.lastHandledByUser.email,
              role: ticket.lastHandledByUser.role,
            }
          : null,
      },
      participants: (ticket.participants || []).map((participant: any) => ({
        id: participant.id,
        participantType: participant.participantType,
        receiveNotifications: participant.receiveNotifications,
        joinedAt: participant.joinedAt,
        user: participant.user
          ? {
              id: participant.user.id,
              fullName: participant.user.fullName,
              email: participant.user.email,
              role: participant.user.role,
            }
          : null,
      })),
      attachments: attachments.map((attachment: any) => ({
        id: attachment.id,
        ticketId: attachment.ticketId,
        messageId: attachment.messageId,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        createdAt: attachment.createdAt,
        fileUrl: `/api/support-tickets/${ticket.id}/attachments/${attachment.id}/file`,
      })),
      messages: messages.map((message: any) => ({
        id: message.id,
        senderUserId: message.senderUserId,
        senderName: message.senderName,
        senderRole: message.senderRole,
        messageType: message.messageType,
        isInternal: message.isInternal,
        message: message.message,
        createdAt: message.createdAt,
        attachments: (message.attachments || []).map((attachment: any) => ({
          id: attachment.id,
          ticketId: attachment.ticketId,
          messageId: attachment.messageId,
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          createdAt: attachment.createdAt,
          fileUrl: `/api/support-tickets/${ticket.id}/attachments/${attachment.id}/file`,
        })),
      })),
      lastMessagePreview: lastVisibleMessage?.message || null,
      lastMessageAt: ticket.lastMessageAt,
    };
  }

  private serializeTicketAuditState(ticket: any) {
    return {
      status: ticket.status,
      priority: ticket.priority,
      assigneeUserId: ticket.assigneeUserId || null,
      assignedByUserId: ticket.assignedByUserId || null,
      assignedAt: ticket.assignedAt?.toISOString?.() || null,
      lastHandledByUserId: ticket.lastHandledByUserId || null,
      customerLastReadAt: ticket.customerLastReadAt?.toISOString?.() || null,
      staffLastReadAt: ticket.staffLastReadAt?.toISOString?.() || null,
      lastMessageAt: ticket.lastMessageAt?.toISOString?.() || null,
      closedAt: ticket.closedAt?.toISOString?.() || null,
    };
  }
}
