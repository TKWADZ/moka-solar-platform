import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { OperationalDataService } from '../operational-data/operational-data.service';
import { PrismaService } from '../prisma/prisma.service';

const HOURLY_INTERVAL_MS = 60 * 60 * 1000;

@Injectable()
export class PortalAutomationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PortalAutomationService.name);
  private intervalHandle: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly operationalDataService: OperationalDataService,
    private readonly aiService: AiService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  onModuleInit() {
    this.intervalHandle = setInterval(() => {
      void this.runHourlyRefresh('INTERVAL');
    }, HOURLY_INTERVAL_MS);

    setTimeout(() => {
      void this.runHourlyRefresh('BOOT');
    }, 5000);
  }

  onModuleDestroy() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  async runHourlyRefresh(trigger: 'BOOT' | 'INTERVAL' | 'MANUAL' = 'MANUAL') {
    if (this.isRunning) {
      return {
        skipped: true,
        reason: 'JOB_ALREADY_RUNNING',
      };
    }

    this.isRunning = true;
    const startedAt = new Date();
    const log = await this.prisma.syncLog.create({
      data: {
        source: 'PORTAL_AUTOMATION',
        syncType: 'HOURLY_MANUAL_REFRESH',
        status: 'RUNNING',
        message: `Bat dau job cap nhat dinh ky (${trigger}).`,
        startedAt,
        rawPayload: {
          trigger,
        } as any,
      },
    });

    try {
      await this.operationalDataService.recalculateAllMeterReadings();
      const reminderDrafts = await this.aiService.generateInvoiceReminderDrafts(
        {
          templateType: 'ALL',
        },
        undefined,
        { automated: true },
      );

      const finishedAt = new Date();
      await this.prisma.syncLog.update({
        where: {
          id: log.id,
        },
        data: {
          status: 'SUCCESS',
          finishedAt,
          message: `Hoan tat refresh dinh ky. Da cap nhat chuoi chi so va tao ${reminderDrafts.length} draft nhac hoa don.`,
          rawPayload: {
            trigger,
            reminderDraftCount: reminderDrafts.length,
          } as any,
        },
      });

      await this.auditLogsService.log({
        action: 'PORTAL_AUTOMATION_RAN',
        entityType: 'SyncLog',
        entityId: log.id,
        payload: {
          trigger,
          reminderDraftCount: reminderDrafts.length,
        },
      });

      return {
        success: true,
        reminderDraftCount: reminderDrafts.length,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Khong the hoan tat job cap nhat dinh ky.';
      this.logger.error(message);

      await this.prisma.syncLog.update({
        where: {
          id: log.id,
        },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          message,
        },
      });

      return {
        success: false,
        message,
      };
    } finally {
      this.isRunning = false;
    }
  }
}
