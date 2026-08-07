import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ZaloNotificationsService } from './zalo-notifications.service';
import { ZaloSettingsService, ZaloTemplateType } from './zalo-settings.service';

const ZALO_AUTOMATION_CRON = process.env.ZALO_AUTOMATION_CRON || '0 */15 * * * *';
const ZALO_AUTOMATION_TIMEZONE =
  process.env.ZALO_AUTOMATION_TIMEZONE || 'Asia/Ho_Chi_Minh';

type ZaloAutomationSource = 'SCHEDULED' | 'MANUAL';

type ZaloAutomationSummary = {
  source: ZaloAutomationSource;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  invoice: { attempted: number; sent: number; skipped: number; failed: number };
  reminder: { attempted: number; sent: number; skipped: number; failed: number };
  paid: { attempted: number; sent: number; skipped: number; failed: number };
};

@Injectable()
export class ZaloAutomationService {
  private readonly logger = new Logger(ZaloAutomationService.name);
  private running = false;
  private lastStartedAt: string | null = null;
  private lastFinishedAt: string | null = null;
  private lastSummary: ZaloAutomationSummary | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly zaloNotificationsService: ZaloNotificationsService,
    private readonly zaloSettingsService: ZaloSettingsService,
  ) {}

  @Cron(ZALO_AUTOMATION_CRON, { timeZone: ZALO_AUTOMATION_TIMEZONE })
  async runScheduled() {
    if (!this.isEnabled()) {
      return;
    }

    await this.run('SCHEDULED');
  }

  getStatus() {
    return {
      enabled: this.isEnabled(),
      running: this.running,
      cron: ZALO_AUTOMATION_CRON,
      timeZone: ZALO_AUTOMATION_TIMEZONE,
      lastStartedAt: this.lastStartedAt,
      lastFinishedAt: this.lastFinishedAt,
      lastError: this.lastError,
      lastSummary: this.lastSummary,
      defaults: {
        batchSize: this.readPositiveInteger('ZALO_AUTOMATION_BATCH_SIZE', 50),
        invoiceLookbackDays: this.readPositiveInteger('ZALO_INVOICE_LOOKBACK_DAYS', 60),
        reminderDaysBeforeDue: this.readNonNegativeInteger(
          'ZALO_REMINDER_DAYS_BEFORE_DUE',
          3,
        ),
        reminderCooldownHours: this.readPositiveInteger(
          'ZALO_REMINDER_COOLDOWN_HOURS',
          72,
        ),
        retryCooldownHours: this.readPositiveInteger('ZALO_RETRY_COOLDOWN_HOURS', 6),
        paidLookbackDays: this.readPositiveInteger('ZALO_PAID_LOOKBACK_DAYS', 30),
      },
    };
  }

  async runNow(actorId?: string, dryRun = true) {
    return this.run('MANUAL', actorId, dryRun);
  }

  private async run(source: ZaloAutomationSource, actorId?: string, forcedDryRun?: boolean) {
    if (this.running) {
      return {
        skipped: true,
        reason: 'ZALO_AUTOMATION_ALREADY_RUNNING',
        status: this.getStatus(),
      };
    }

    this.running = true;
    const startedAt = new Date().toISOString();
    this.lastStartedAt = startedAt;
    this.lastError = null;

    try {
      const config = await this.zaloSettingsService.resolveConfig();
      const dryRun = forcedDryRun ?? config.dryRun;
      const batchSize = this.readPositiveInteger('ZALO_AUTOMATION_BATCH_SIZE', 50);
      const invoiceLookbackDays = this.readPositiveInteger('ZALO_INVOICE_LOOKBACK_DAYS', 60);
      const reminderDaysBeforeDue = this.readNonNegativeInteger(
        'ZALO_REMINDER_DAYS_BEFORE_DUE',
        3,
      );
      const reminderCooldownHours = this.readPositiveInteger(
        'ZALO_REMINDER_COOLDOWN_HOURS',
        72,
      );
      const retryCooldownHours = this.readPositiveInteger('ZALO_RETRY_COOLDOWN_HOURS', 6);
      const paidLookbackDays = this.readPositiveInteger('ZALO_PAID_LOOKBACK_DAYS', 30);
      const now = new Date();
      const invoiceLookback = this.shiftDays(now, -invoiceLookbackDays);
      const paidLookback = this.shiftDays(now, -paidLookbackDays);
      const reminderThreshold = this.shiftDays(now, reminderDaysBeforeDue);
      const retryCooldownStart = this.shiftHours(now, -retryCooldownHours);
      const reminderCooldownStart = this.shiftHours(now, -reminderCooldownHours);

      const oneTimeMessageExclusion = (templateType: 'INVOICE' | 'PAID') =>
        dryRun
          ? {
              templateType,
              dryRun: true,
              deletedAt: null,
              createdAt: { gte: retryCooldownStart },
            }
          : {
              templateType,
              dryRun: false,
              deletedAt: null,
              OR: [
                { sendStatus: 'SENT' },
                { createdAt: { gte: retryCooldownStart } },
              ],
            };

      const reminderExclusion = {
        templateType: 'REMINDER',
        dryRun,
        deletedAt: null,
        createdAt: { gte: reminderCooldownStart },
      };

      const [invoiceCandidates, reminderCandidates, paidCandidates] = await Promise.all([
        this.prisma.invoice.findMany({
          where: {
            deletedAt: null,
            status: InvoiceStatus.ISSUED,
            issuedAt: { gte: invoiceLookback },
            zaloMessageLogs: {
              none: oneTimeMessageExclusion('INVOICE'),
            },
          },
          orderBy: [{ issuedAt: 'asc' }],
          take: batchSize,
          select: { id: true },
        }),
        this.prisma.invoice.findMany({
          where: {
            deletedAt: null,
            status: {
              in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIAL, InvoiceStatus.OVERDUE],
            },
            dueDate: { lte: reminderThreshold },
            zaloMessageLogs: {
              none: reminderExclusion,
            },
          },
          orderBy: [{ dueDate: 'asc' }],
          take: batchSize,
          select: {
            id: true,
            totalAmount: true,
            paidAmount: true,
          },
        }),
        this.prisma.invoice.findMany({
          where: {
            deletedAt: null,
            status: InvoiceStatus.PAID,
            updatedAt: { gte: paidLookback },
            zaloMessageLogs: {
              none: oneTimeMessageExclusion('PAID'),
            },
          },
          orderBy: [{ updatedAt: 'asc' }],
          take: batchSize,
          select: { id: true },
        }),
      ]);

      const summary: ZaloAutomationSummary = {
        source,
        dryRun,
        startedAt,
        finishedAt: '',
        invoice: { attempted: 0, sent: 0, skipped: 0, failed: 0 },
        reminder: { attempted: 0, sent: 0, skipped: 0, failed: 0 },
        paid: { attempted: 0, sent: 0, skipped: 0, failed: 0 },
      };

      for (const invoice of invoiceCandidates) {
        await this.processCandidate({
          invoiceId: invoice.id,
          templateType: 'INVOICE',
          actorId,
          dryRun,
          cooldownHours: retryCooldownHours,
          summary: summary.invoice,
        });
      }

      for (const invoice of reminderCandidates) {
        const outstandingAmount = Math.max(
          Number(invoice.totalAmount || 0) - Number(invoice.paidAmount || 0),
          0,
        );
        if (outstandingAmount <= 0) {
          summary.reminder.skipped += 1;
          continue;
        }

        await this.processCandidate({
          invoiceId: invoice.id,
          templateType: 'REMINDER',
          actorId,
          dryRun,
          cooldownHours: reminderCooldownHours,
          summary: summary.reminder,
        });
      }

      for (const invoice of paidCandidates) {
        await this.processCandidate({
          invoiceId: invoice.id,
          templateType: 'PAID',
          actorId,
          dryRun,
          cooldownHours: retryCooldownHours,
          summary: summary.paid,
        });
      }

      summary.finishedAt = new Date().toISOString();
      this.lastFinishedAt = summary.finishedAt;
      this.lastSummary = summary;
      this.logger.log(
        `Zalo automation ${source.toLowerCase()} finished: ${JSON.stringify(summary)}`,
      );

      return summary;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Unknown Zalo automation error';
      this.lastFinishedAt = new Date().toISOString();
      this.logger.error(`Zalo automation failed: ${this.lastError}`);
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async processCandidate(params: {
    invoiceId: string;
    templateType: ZaloTemplateType;
    actorId?: string;
    dryRun: boolean;
    cooldownHours: number;
    summary: { attempted: number; sent: number; skipped: number; failed: number };
  }) {
    const shouldAttempt = await this.shouldAttempt(
      params.invoiceId,
      params.templateType,
      params.cooldownHours,
      params.dryRun,
    );

    if (!shouldAttempt) {
      params.summary.skipped += 1;
      return;
    }

    params.summary.attempted += 1;

    try {
      const result = await this.zaloNotificationsService.sendInvoiceNotification({
        invoiceId: params.invoiceId,
        actorId: params.actorId,
        templateType: params.templateType,
        dryRun: params.dryRun,
        skipIfAlreadySent: params.templateType !== 'REMINDER',
      });

      if ((result as any).skipped) {
        params.summary.skipped += 1;
      } else if ((result as any).success) {
        params.summary.sent += 1;
      } else {
        params.summary.failed += 1;
      }
    } catch (error) {
      params.summary.failed += 1;
      this.logger.warn(
        `Zalo ${params.templateType} send failed for invoice ${params.invoiceId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  private async shouldAttempt(
    invoiceId: string,
    templateType: ZaloTemplateType,
    cooldownHours: number,
    currentDryRun: boolean,
  ) {
    const latest = await this.prisma.zaloMessageLog.findFirst({
      where: {
        invoiceId,
        templateType,
        deletedAt: null,
        ...(currentDryRun ? {} : { dryRun: false }),
      },
      orderBy: [{ createdAt: 'desc' }],
    });

    if (!latest) {
      return true;
    }

    if (
      templateType !== 'REMINDER' &&
      latest.sendStatus === 'SENT' &&
      latest.dryRun === false
    ) {
      return false;
    }

    const ageMs = Date.now() - latest.createdAt.getTime();
    return ageMs >= cooldownHours * 60 * 60 * 1000;
  }

  private isEnabled() {
    return String(this.configService.get('ZALO_AUTOMATION_ENABLED') ?? 'false').toLowerCase() ===
      'true';
  }

  private readPositiveInteger(key: string, fallback: number) {
    const value = Number(this.configService.get(key));
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private readNonNegativeInteger(key: string, fallback: number) {
    const value = Number(this.configService.get(key));
    return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
  }

  private shiftDays(date: Date, amount: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + amount);
    return next;
  }

  private shiftHours(date: Date, amount: number) {
    const next = new Date(date);
    next.setUTCHours(next.getUTCHours() + amount);
    return next;
  }
}
