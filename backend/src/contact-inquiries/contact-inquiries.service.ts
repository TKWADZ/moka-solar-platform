import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactInquiryStatus } from '@prisma/client';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { CreateContactInquiryDto } from './dto/create-contact-inquiry.dto';
import { UpdateContactInquiryDto } from './dto/update-contact-inquiry.dto';

@Injectable()
export class ContactInquiriesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private auditLogsService: AuditLogsService,
  ) {}

  findAll(status?: ContactInquiryStatus) {
    return this.prisma.contactInquiry.findMany({
      where: {
        deletedAt: null,
        ...(status ? { status } : {}),
      },
      include: {
        handledBy: {
          include: {
            role: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    });
  }

  async create(dto: CreateContactInquiryDto) {
    const inquiry = await this.prisma.contactInquiry.create({
      data: {
        fullName: dto.fullName.trim(),
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone?.trim() || null,
        companyName: dto.companyName?.trim() || null,
        siteCount: dto.siteCount?.trim() || null,
        message: dto.message.trim(),
        sourcePage: dto.sourcePage?.trim() || 'contact',
      },
    });

    const admins = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        role: {
          code: {
            in: ['SUPER_ADMIN', 'ADMIN'],
          },
        },
      },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        this.notificationsService.create({
          userId: admin.id,
          title: 'Lead moi tu website',
          body: `${inquiry.fullName} vua gui yeu cau tu van qua trang public.`,
        }),
      ),
    );

    return inquiry;
  }

  async update(id: string, dto: UpdateContactInquiryDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.contactInquiry.findFirst({
      where: {
        id,
        deletedAt: null,
      },
    });

    if (!existing) {
      throw new NotFoundException('Contact inquiry not found');
    }

    const updated = await this.prisma.contactInquiry.update({
      where: { id },
      data: {
        status: dto.status ?? existing.status,
        internalNote:
          dto.internalNote !== undefined ? dto.internalNote.trim() || null : existing.internalNote,
        handledByUserId:
          dto.status !== undefined || dto.internalNote !== undefined ? actor.sub : existing.handledByUserId,
      },
      include: {
        handledBy: {
          include: {
            role: true,
          },
        },
      },
    });

    await this.auditLogsService.log({
      userId: actor.sub,
      action: 'CONTACT_INQUIRY_UPDATED',
      entityType: 'ContactInquiry',
      entityId: updated.id,
      payload: {
        status: updated.status,
        handledByUserId: updated.handledByUserId,
      },
    });

    return updated;
  }
}
