import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RequestContextService } from '../common/request-context/request-context.service';

type AuditLogEntryInput = {
  userId?: string;
  action: string;
  moduleKey?: string;
  entityType: string;
  entityId?: string | null;
  payload?: Record<string, unknown> | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

@Injectable()
export class AuditLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly requestContextService: RequestContextService,
  ) {}

  async log(entry: AuditLogEntryInput) {
    if (!entry.userId) {
      return null;
    }

    const requestContext = this.requestContextService.get();

    return this.prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        moduleKey: entry.moduleKey || null,
        entityType: entry.entityType,
        entityId: entry.entityId || null,
        payload: this.toNullableJson(entry.payload),
        beforeState: this.toNullableJson(entry.beforeState),
        afterState: this.toNullableJson(entry.afterState),
        ipAddress: entry.ipAddress ?? requestContext?.ipAddress ?? null,
        userAgent: entry.userAgent ?? requestContext?.userAgent ?? null,
      },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
    });
  }

  findAll(limit = 50, filters?: { entityType?: string; entityId?: string; action?: string }) {
    return this.prisma.auditLog.findMany({
      where: {
        ...(filters?.entityType ? { entityType: filters.entityType } : {}),
        ...(filters?.entityId ? { entityId: filters.entityId } : {}),
        ...(filters?.action ? { action: filters.action } : {}),
      },
      include: {
        user: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }).then((logs) =>
      logs.map((log) => ({
        ...log,
        user: this.toActor(log.user),
      })),
    );
  }

  async listEntityTimeline(entityType: string, entityId: string, limit = 100) {
    const [logs, internalNotes, assignment, ticketMessages] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { entityType, entityId },
        include: {
          user: {
            include: {
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.internalNote.findMany({
        where: {
          entityType,
          entityId,
          deletedAt: null,
        },
        include: {
          createdByUser: {
            include: {
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.prisma.entityAssignment.findUnique({
        where: {
          entityType_entityId: {
            entityType,
            entityId,
          },
        },
        include: {
          assignedToUser: {
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
        },
      }),
      entityType === 'SupportTicket'
        ? this.prisma.ticketMessage.findMany({
            where: {
              ticketId: entityId,
            },
            include: {
              senderUser: {
                include: {
                  role: true,
                },
              },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    const timeline = [
      ...logs.map((log) => ({
        id: `audit-${log.id}`,
        kind: 'AUDIT',
        action: log.action,
        moduleKey: log.moduleKey,
        body: this.resolveAuditMessage(log.action, log.payload),
        createdAt: log.createdAt,
        beforeState: log.beforeState,
        afterState: log.afterState,
        payload: log.payload,
        actor: this.toActor(log.user),
        metadata: {
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
        },
      })),
      ...internalNotes.map((note) => ({
        id: `note-${note.id}`,
        kind: 'INTERNAL_NOTE',
        action: 'INTERNAL_NOTE_ADDED',
        body: note.body,
        createdAt: note.createdAt,
        actor: this.toActor(note.createdByUser),
      })),
      ...ticketMessages.map((message) => ({
        id: `message-${message.id}`,
        kind: message.isInternal ? 'INTERNAL_NOTE' : 'MESSAGE',
        action: message.messageType,
        body: message.message,
        createdAt: message.createdAt,
        actor: message.senderUser
          ? this.toActor(message.senderUser)
          : {
              id: message.senderUserId || null,
              fullName: message.senderName,
              email: null,
              role: { code: message.senderRole, name: message.senderRole },
            },
        metadata: {
          isInternal: message.isInternal,
          messageType: message.messageType,
        },
      })),
    ]
      .sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      )
      .slice(0, limit);

    return {
      assignment: this.sanitizeAssignment(assignment),
      notes: internalNotes.map((note) => this.sanitizeInternalNote(note)),
      timeline,
    };
  }

  async listInternalNotes(entityType: string, entityId: string) {
    const notes = await this.prisma.internalNote.findMany({
      where: {
        entityType,
        entityId,
        deletedAt: null,
      },
      include: {
        createdByUser: {
          include: {
            role: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((note) => this.sanitizeInternalNote(note));
  }

  async createInternalNote(params: {
    entityType: string;
    entityId: string;
    body: string;
    actorId: string;
    moduleKey?: string;
  }) {
    const note = await this.prisma.internalNote.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        body: params.body,
        createdByUserId: params.actorId,
      },
      include: {
        createdByUser: {
          include: {
            role: true,
          },
        },
      },
    });

    await this.log({
      userId: params.actorId,
      action: 'INTERNAL_NOTE_CREATED',
      moduleKey: params.moduleKey || this.resolveModuleKey(params.entityType),
      entityType: params.entityType,
      entityId: params.entityId,
      afterState: {
        body: note.body,
      },
    });

    return this.sanitizeInternalNote(note);
  }

  async getAssignment(entityType: string, entityId: string) {
    const assignment = await this.prisma.entityAssignment.findUnique({
      where: {
        entityType_entityId: {
          entityType,
          entityId,
        },
      },
      include: {
        assignedToUser: {
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
      },
    });

    return this.sanitizeAssignment(assignment);
  }

  async assignEntity(params: {
    entityType: string;
    entityId: string;
    assignedToUserId?: string | null;
    actorId: string;
    moduleKey?: string;
  }) {
    const previous = await this.getAssignment(params.entityType, params.entityId);
    const assignedAt = params.assignedToUserId ? new Date() : null;

    const assignment = await this.prisma.entityAssignment.upsert({
      where: {
        entityType_entityId: {
          entityType: params.entityType,
          entityId: params.entityId,
        },
      },
      create: {
        entityType: params.entityType,
        entityId: params.entityId,
        assignedToUserId: params.assignedToUserId || null,
        assignedByUserId: params.assignedToUserId ? params.actorId : null,
        assignedAt,
        lastHandledByUserId: params.actorId,
      },
      update: {
        assignedToUserId: params.assignedToUserId || null,
        assignedByUserId: params.assignedToUserId ? params.actorId : null,
        assignedAt,
        lastHandledByUserId: params.actorId,
      },
      include: {
        assignedToUser: {
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
      },
    });

    await this.log({
      userId: params.actorId,
      action: 'ENTITY_ASSIGNED',
      moduleKey: params.moduleKey || this.resolveModuleKey(params.entityType),
      entityType: params.entityType,
      entityId: params.entityId,
      beforeState: previous
        ? {
            assignedToUserId: previous.assignedToUserId,
            assignedByUserId: previous.assignedByUserId,
            assignedAt: previous.assignedAt?.toISOString?.() || null,
            lastHandledByUserId: previous.lastHandledByUserId,
          }
        : null,
      afterState: {
        assignedToUserId: assignment.assignedToUserId,
        assignedByUserId: assignment.assignedByUserId,
        assignedAt: assignment.assignedAt?.toISOString?.() || null,
        lastHandledByUserId: assignment.lastHandledByUserId,
      },
    });

    return this.sanitizeAssignment(assignment);
  }

  async touchEntity(params: {
    entityType: string;
    entityId: string;
    actorId: string;
    moduleKey?: string;
  }) {
    const assignment = await this.prisma.entityAssignment.upsert({
      where: {
        entityType_entityId: {
          entityType: params.entityType,
          entityId: params.entityId,
        },
      },
      create: {
        entityType: params.entityType,
        entityId: params.entityId,
        lastHandledByUserId: params.actorId,
      },
      update: {
        lastHandledByUserId: params.actorId,
      },
      include: {
        assignedToUser: {
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
      },
    });

    return this.sanitizeAssignment(assignment);
  }

  private toNullableJson(
    value: Record<string, unknown> | null | undefined,
  ): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (value === null) {
      return Prisma.JsonNull;
    }

    return value as Prisma.InputJsonValue;
  }

  private resolveModuleKey(entityType: string) {
    switch (entityType) {
      case 'Customer':
        return 'customers';
      case 'Contract':
        return 'contracts';
      case 'Invoice':
        return 'billing';
      case 'SupportTicket':
        return 'support';
      default:
        return 'operations';
    }
  }

  private resolveAuditMessage(action: string, payload: Prisma.JsonValue | null) {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : typeof payload.summary === 'string'
            ? payload.summary
            : null;

      if (message) {
        return message;
      }
    }

    return action
      .replaceAll('_', ' ')
      .trim();
  }

  private toActor(user: any) {
    if (!user) {
      return null;
    }

    return {
      id: user.id || null,
      fullName: user.fullName || null,
      email: user.email || null,
      role: user.role || null,
    };
  }

  private sanitizeInternalNote(note: any) {
    if (!note) {
      return note;
    }

    return {
      id: note.id,
      entityType: note.entityType,
      entityId: note.entityId,
      body: note.body,
      createdByUserId: note.createdByUserId,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      deletedAt: note.deletedAt,
      createdByUser: this.toActor(note.createdByUser),
    };
  }

  private sanitizeAssignment(assignment: any) {
    if (!assignment) {
      return assignment;
    }

    return {
      id: assignment.id,
      entityType: assignment.entityType,
      entityId: assignment.entityId,
      assignedToUserId: assignment.assignedToUserId,
      assignedByUserId: assignment.assignedByUserId,
      assignedAt: assignment.assignedAt,
      lastHandledByUserId: assignment.lastHandledByUserId,
      createdAt: assignment.createdAt,
      updatedAt: assignment.updatedAt,
      assignedToUser: this.toActor(assignment.assignedToUser),
      assignedByUser: this.toActor(assignment.assignedByUser),
      lastHandledByUser: this.toActor(assignment.lastHandledByUser),
    };
  }
}
