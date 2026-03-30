import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

@Injectable()
export class SupportTicketsService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private auditLogsService: AuditLogsService,
  ) {}

  findAll() {
    return this.prisma.supportTicket.findMany({
      where: { deletedAt: null },
      include: {
        customer: { include: { user: true } },
        messages: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  findMine(customerId: string) {
    return this.prisma.supportTicket.findMany({
      where: { customerId, deletedAt: null },
      include: {
        messages: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(user: AuthenticatedUser, dto: CreateTicketDto) {
    return this.prisma.supportTicket.create({
      data: {
        customerId: user.customerId!,
        title: dto.title,
        description: dto.description,
        priority: dto.priority || 'MEDIUM',
        messages: {
          create: {
            senderName: user.email,
            senderRole: 'CUSTOMER',
            message: dto.description,
          },
        },
      },
      include: { messages: true },
    });
  }

  async reply(ticketId: string, user: AuthenticatedUser, dto: ReplyTicketDto) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: {
        id: ticketId,
        deletedAt: null,
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    if (user.role === 'CUSTOMER' && ticket.customerId !== user.customerId) {
      throw new ForbiddenException('You do not have access to this ticket');
    }

    const message = await this.prisma.ticketMessage.create({
      data: {
        ticketId,
        senderName: user.email,
        senderRole: user.role,
        message: dto.message,
      },
    });

    const nextStatus = user.role === 'CUSTOMER' ? TicketStatus.OPEN : TicketStatus.IN_PROGRESS;
    await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: nextStatus },
    });

    if (user.role !== 'CUSTOMER') {
      await this.notificationsService.create({
        userId: ticket.customer.userId,
        title: 'Ticket duoc cap nhat',
        body: `Yeu cau "${ticket.title}" vua nhan phan hoi moi tu doi van hanh.`,
      });
    }

    await this.auditLogsService.log({
      userId: user.sub,
      action: 'SUPPORT_TICKET_REPLIED',
      entityType: 'SupportTicket',
      entityId: ticketId,
      payload: { message: dto.message },
    });

    return message;
  }

  async updateStatus(ticketId: string, status: TicketStatus, actor: AuthenticatedUser) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id: ticketId, deletedAt: null },
      include: {
        customer: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status },
    });

    await this.auditLogsService.log({
      userId: actor.sub,
      action: 'SUPPORT_TICKET_STATUS_UPDATED',
      entityType: 'SupportTicket',
      entityId: ticketId,
      payload: { status },
    });

    return updated;
  }
}
