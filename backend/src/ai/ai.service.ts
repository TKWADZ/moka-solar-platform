import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import OpenAI from 'openai';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { ContentPostsService } from '../content-posts/content-posts.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyAiActionDto } from './dto/apply-ai-action.dto';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { GenerateInvoiceRemindersDto } from './dto/generate-invoice-reminders.dto';
import { PublicAssistantChatDto } from './dto/public-assistant-chat.dto';
import { RunAiActionDto } from './dto/run-ai-action.dto';
import { SaveAiActionDraftDto } from './dto/save-ai-action-draft.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

type AssistantRole = 'user' | 'assistant';

type AssistantMessage = {
  role: AssistantRole;
  content: string;
};

type ResolvedAiConfig = {
  apiKey: string | null;
  model: string;
  source: 'database' | 'env' | 'unset';
  hasStoredApiKey: boolean;
  updatedAt: string | null;
};

type AiActionDraftRecord = {
  id: string;
  actionType: string;
  title: string;
  prompt: string | null;
  content: string;
  targetType: string | null;
  targetId: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  appliedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type PublicChatBucket = {
  used: number;
  resetAt: number;
  lastMessageAt: number;
  cooldownUntil: number;
};

const OPENAI_PROVIDER = 'openai';
const DEFAULT_OPENAI_MODEL = 'gpt-5.4-mini';
const DEFAULT_PUBLIC_OPENAI_MODEL = 'gpt-5.4-mini';
const PUBLIC_WINDOW_MS = 12 * 60 * 60 * 1000;
const PUBLIC_MAX_MESSAGES = 10;
const PUBLIC_HISTORY_LIMIT = 6;
const PUBLIC_MAX_INPUT_LENGTH = 500;
const PUBLIC_MAX_OUTPUT_TOKENS = 260;
const PUBLIC_SPAM_GAP_MS = 8 * 1000;
const PUBLIC_COOLDOWN_MS = 30 * 1000;
const PUBLIC_BUCKET_LIMIT = 2000;

@Injectable()
export class AiService {
  private client: OpenAI | null = null;
  private cachedApiKey: string | null = null;
  private readonly publicBuckets = new Map<string, PublicChatBucket>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditLogsService: AuditLogsService,
    private readonly contentPostsService: ContentPostsService,
  ) {}

  private get aiProviderConfigs() {
    return (this.prisma as PrismaClient).aiProviderConfig;
  }

  private get aiActionDrafts() {
    return (this.prisma as PrismaClient).aiActionDraft;
  }

  async getStatus() {
    const config = await this.resolveConfig();

    return {
      provider: OPENAI_PROVIDER,
      configured: Boolean(config.apiKey),
      model: config.model,
      source: config.source,
      hasStoredApiKey: config.hasStoredApiKey,
      updatedAt: config.updatedAt,
    };
  }

  async getSettings() {
    return this.getStatus();
  }

  async updateSettings(dto: UpdateAiSettingsDto, actorId: string) {
    if (!dto.apiKey?.trim() && !dto.model?.trim() && !dto.clearStoredApiKey) {
      throw new BadRequestException(
        'Vui lòng nhập API key, model hoặc chọn xóa khóa đã lưu.',
      );
    }

    const current = await this.aiProviderConfigs.findUnique({
      where: { provider: OPENAI_PROVIDER },
    });

    const nextApiKey = dto.clearStoredApiKey
      ? null
      : dto.apiKey?.trim()
        ? this.encrypt(dto.apiKey.trim())
        : current?.encryptedApiKey || null;

    const nextModel =
      dto.model?.trim() ||
      current?.model ||
      this.configService.get<string>('OPENAI_MODEL') ||
      DEFAULT_OPENAI_MODEL;

    await this.aiProviderConfigs.upsert({
      where: { provider: OPENAI_PROVIDER },
      create: {
        provider: OPENAI_PROVIDER,
        encryptedApiKey: nextApiKey,
        model: nextModel,
        updatedByUserId: actorId,
      },
      update: {
        encryptedApiKey: nextApiKey,
        model: nextModel,
        updatedByUserId: actorId,
        deletedAt: null,
      },
    });

    this.client = null;
    this.cachedApiKey = null;

    await this.auditLogsService.log({
      userId: actorId,
      action: 'AI_SETTINGS_UPDATED',
      entityType: 'AiProviderConfig',
      entityId: OPENAI_PROVIDER,
      payload: {
        provider: OPENAI_PROVIDER,
        model: nextModel,
        updatedApiKey: Boolean(dto.apiKey?.trim()),
        clearedStoredApiKey: Boolean(dto.clearStoredApiKey),
      },
    });

    return this.getStatus();
  }

  async chat(dto: AssistantChatDto, actorId: string) {
    const client = await this.getClient();
    const messages = this.normalizeMessages(dto.messages);

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      throw new BadRequestException('Tin nhắn cuối cùng phải là câu hỏi của người dùng.');
    }

    const resolvedConfig = await this.resolveConfig();
    let response: OpenAI.Responses.Response;

    try {
      response = await client.responses.create({
        model: resolvedConfig.model,
        store: false,
        instructions: this.buildAdminInstructions(dto.taskLabel),
        input: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });
    } catch (error) {
      this.handleOpenAiError(error);
    }

    const reply = this.extractText(response).trim();

    if (!reply) {
      throw new ServiceUnavailableException(
        'ChatGPT chưa tạo được phản hồi. Vui lòng thử lại.',
      );
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'AI_ASSISTANT_USED',
      entityType: 'AiAssistant',
      entityId: response.id,
      payload: {
        model: response.model || resolvedConfig.model,
        taskLabel: dto.taskLabel || null,
        promptLength: messages[messages.length - 1]?.content.length || 0,
      },
    });

    return {
      id: response.id,
      model: response.model || resolvedConfig.model,
      reply,
      createdAt: new Date().toISOString(),
    };
  }

  async listActionDrafts() {
    const drafts = await this.aiActionDrafts.findMany({
      where: {
        deletedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 40,
    });

    return drafts.map((draft) => this.serializeDraft(draft));
  }

  async runAction(dto: RunAiActionDto, actorId: string) {
    const client = await this.getClient();
    const config = await this.resolveConfig();
    let response: OpenAI.Responses.Response;

    try {
      response = await client.responses.create({
        model: config.model,
        store: false,
        instructions: this.buildActionInstructions(dto),
        input: [
          {
            role: 'user',
            content: this.buildActionPrompt(dto),
          },
        ],
      });
    } catch (error) {
      this.handleOpenAiError(error);
    }

    const content = this.extractText(response).trim();

    if (!content) {
      throw new ServiceUnavailableException(
        'AI chua tao duoc noi dung de ap dung cho tac vu nay.',
      );
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'AI_ACTION_RUN',
      entityType: 'AiAction',
      entityId: response.id,
      payload: {
        actionType: dto.actionType,
        targetType: dto.targetType || null,
        targetId: dto.targetId || null,
      },
    });

    return {
      id: response.id,
      actionType: dto.actionType,
      title: dto.title?.trim() || this.defaultActionTitle(dto.actionType),
      content,
      suggestedTargetType: this.defaultTargetType(dto.actionType),
      model: response.model || config.model,
      createdAt: new Date().toISOString(),
    };
  }

  async saveDraft(dto: SaveAiActionDraftDto, actorId: string) {
    const draft = await this.aiActionDrafts.create({
      data: {
        actionType: dto.actionType,
        title: dto.title.trim(),
        prompt: dto.prompt?.trim() || null,
        content: dto.content.trim(),
        targetType: dto.targetType?.trim() || null,
        targetId: dto.targetId?.trim() || null,
        metadata: (dto.metadata || null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput,
        createdByUserId: actorId,
      },
    });

    await this.auditLogsService.log({
      userId: actorId,
      action: 'AI_ACTION_DRAFT_SAVED',
      entityType: 'AiActionDraft',
      entityId: draft.id,
      payload: {
        actionType: draft.actionType,
        targetType: draft.targetType,
        targetId: draft.targetId,
      },
    });

    return this.serializeDraft(draft);
  }

  async applyDraft(dto: ApplyAiActionDto, actorId: string) {
    const targetType = dto.targetType?.trim() || this.defaultTargetType(dto.actionType);
    let appliedResult: Record<string, unknown> | null = null;

    if (targetType === 'CONTENT_POST') {
      const post = await this.contentPostsService.create(
        {
          title: dto.title.trim(),
          excerpt: dto.content.trim().slice(0, 220),
          content: dto.content.trim(),
          status: 'DRAFT',
          tags: this.defaultContentTags(dto.actionType),
        } as any,
        actorId,
      );

      appliedResult = {
        targetType,
        targetId: post.id,
        slug: post.slug,
      };
    }

    if (targetType === 'INVOICE_REMINDER') {
      const draft = await this.saveDraft(
        {
          actionType: dto.actionType,
          title: dto.title,
          content: dto.content,
          targetType,
          targetId: dto.targetId,
          metadata: {
            draftChannel: 'ZALO_OA_TEMPLATE',
          },
        },
        actorId,
      );

      await this.aiActionDrafts.update({
        where: {
          id: draft.id,
        },
        data: {
          status: 'READY',
          appliedAt: new Date(),
        },
      });

      appliedResult = {
        targetType,
        targetId: draft.id,
      };
    }

    if (!appliedResult) {
      throw new BadRequestException(
        'Tac vu nay hien chi ho tro ap dung ngay cho bai viet va draft nhac hoa don.',
      );
    }

    if (dto.draftId) {
      await this.aiActionDrafts.update({
        where: {
          id: dto.draftId,
        },
        data: {
          status: 'APPLIED',
          appliedAt: new Date(),
        },
      });
    }

    await this.auditLogsService.log({
      userId: actorId,
      action: 'AI_ACTION_APPLIED',
      entityType: 'AiActionDraft',
      entityId: dto.draftId || null,
      payload: {
        actionType: dto.actionType,
        targetType,
        targetId: appliedResult.targetId,
      },
    });

    return {
      success: true,
      targetType,
      appliedResult,
    };
  }

  async generateInvoiceReminderDrafts(
    dto: GenerateInvoiceRemindersDto,
    actorId?: string,
    options?: { automated?: boolean },
  ) {
    const templateTypes =
      dto.templateType && dto.templateType !== 'ALL'
        ? [dto.templateType]
        : (['UPCOMING', 'DUE', 'OVERDUE'] as const);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        deletedAt: null,
        status: {
          in: ['ISSUED', 'PARTIAL', 'OVERDUE'],
        },
        ...(dto.billingMonth ? { billingMonth: dto.billingMonth } : {}),
        ...(dto.billingYear ? { billingYear: dto.billingYear } : {}),
      },
      include: {
        customer: {
          include: {
            user: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }],
    });

    const now = new Date();
    const drafts: AiActionDraftRecord[] = [];

    for (const invoice of invoices) {
      const diffDays = Math.ceil(
        (new Date(invoice.dueDate).getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
      );

      for (const templateType of templateTypes) {
        if (!this.matchesReminderTemplate(templateType, diffDays, invoice.status)) {
          continue;
        }

        const { title, content } = this.buildReminderTemplate(invoice, templateType);
        const existingCandidates = await this.aiActionDrafts.findMany({
          where: {
            deletedAt: null,
            actionType: 'INVOICE_REMINDER',
            targetType: 'INVOICE',
            targetId: invoice.id,
          },
          orderBy: [{ updatedAt: 'desc' }],
          take: 10,
        });
        const existing =
          existingCandidates.find(
            (draft) =>
              draft.metadata &&
              typeof draft.metadata === 'object' &&
              !Array.isArray(draft.metadata) &&
              (draft.metadata as Record<string, unknown>).templateType === templateType,
          ) || null;

        const draft = existing
          ? await this.aiActionDrafts.update({
              where: {
                id: existing.id,
              },
              data: {
                title,
                content,
                status: 'DRAFT',
                metadata: {
                  templateType,
                  invoiceNumber: invoice.invoiceNumber,
                  billingMonth: invoice.billingMonth,
                  billingYear: invoice.billingYear,
                  amount: Number(invoice.totalAmount || 0),
                  customerName:
                    invoice.customer?.companyName || invoice.customer?.user?.fullName || 'Khach hang',
                  dueDate: invoice.dueDate.toISOString(),
                  channel: 'ZALO_OA_TEMPLATE',
                  automated: Boolean(options?.automated),
                } as any,
                createdByUserId: actorId || null,
              },
            })
          : await this.aiActionDrafts.create({
              data: {
                actionType: 'INVOICE_REMINDER',
                title,
                content,
                targetType: 'INVOICE',
                targetId: invoice.id,
                status: 'DRAFT',
                metadata: {
                  templateType,
                  invoiceNumber: invoice.invoiceNumber,
                  billingMonth: invoice.billingMonth,
                  billingYear: invoice.billingYear,
                  amount: Number(invoice.totalAmount || 0),
                  customerName:
                    invoice.customer?.companyName || invoice.customer?.user?.fullName || 'Khach hang',
                  dueDate: invoice.dueDate.toISOString(),
                  channel: 'ZALO_OA_TEMPLATE',
                  automated: Boolean(options?.automated),
                } as any,
                createdByUserId: actorId || null,
              },
            });

        drafts.push(this.serializeDraft(draft));
      }
    }

    if (actorId) {
      await this.auditLogsService.log({
        userId: actorId,
        action: 'AI_INVOICE_REMINDER_DRAFTS_GENERATED',
        entityType: 'AiActionDraft',
        payload: {
          templateTypes,
          count: drafts.length,
          automated: Boolean(options?.automated),
        },
      });
    }

    return drafts;
  }

  async publicChat(dto: PublicAssistantChatDto, clientIp: string) {
    if (!this.isWebsiteAiEnabled()) {
      return this.buildPublicFallbackResponse({
        reply:
          'Trợ lý AI trên website đang tạm nghỉ. Bạn có thể chọn Zalo, gọi hotline hoặc để lại số điện thoại để đội ngũ Moka Solar liên hệ trực tiếp.',
        remainingMessages: 0,
        leadSuggested: true,
      });
    }

    if (!dto.humanCheckConfirmed) {
      throw new BadRequestException(
        'Vui lòng xác nhận bạn đang cần tư vấn thật trước khi bắt đầu chat.',
      );
    }

    const messages = this.normalizePublicMessages(dto.messages);

    if (!messages.length || messages[messages.length - 1].role !== 'user') {
      throw new BadRequestException('Tin nhắn cuối cùng phải là câu hỏi của khách truy cập.');
    }

    const bucket = this.consumePublicQuota(clientIp, dto.visitorId);
    const remainingMessages = Math.max(0, PUBLIC_MAX_MESSAGES - bucket.used);
    const config = await this.resolveConfig();
    const publicModel = this.resolvePublicModel(config.model);

    if (!config.apiKey) {
      return this.buildPublicFallbackResponse({
        model: publicModel,
        remainingMessages,
        leadSuggested: true,
      });
    }

    try {
      const client = await this.getClient();
      const response = await client.responses.create({
        model: publicModel,
        store: false,
        max_output_tokens: PUBLIC_MAX_OUTPUT_TOKENS,
        instructions: this.buildPublicInstructions(dto.pagePath),
        input: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      const reply = this.extractText(response).trim();

      return {
        id: response.id,
        model: response.model || publicModel,
        reply: reply || this.buildPublicFallbackText(),
        createdAt: new Date().toISOString(),
        remainingMessages,
        leadSuggested: this.shouldSuggestLead(messages[messages.length - 1]?.content || '', reply),
      };
    } catch (error) {
      return this.buildPublicFallbackResponse({
        model: publicModel,
        remainingMessages,
        reply: this.buildPublicFallbackText(this.describePublicError(error)),
        leadSuggested: true,
      });
    }
  }

  private async getClient() {
    const config = await this.resolveConfig();

    if (!config.apiKey) {
      throw new ServiceUnavailableException('Chưa cấu hình OpenAI API key trên máy chủ.');
    }

    if (!this.client || this.cachedApiKey !== config.apiKey) {
      this.client = new OpenAI({ apiKey: config.apiKey });
      this.cachedApiKey = config.apiKey;
    }

    return this.client;
  }

  private async resolveConfig(): Promise<ResolvedAiConfig> {
    const record = await this.aiProviderConfigs.findUnique({
      where: { provider: OPENAI_PROVIDER },
    });

    const storedApiKey = record?.encryptedApiKey
      ? this.decrypt(record.encryptedApiKey)
      : null;
    const envApiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim() || null;
    const model =
      record?.model?.trim() ||
      this.configService.get<string>('OPENAI_MODEL')?.trim() ||
      DEFAULT_OPENAI_MODEL;

    if (storedApiKey) {
      return {
        apiKey: storedApiKey,
        model,
        source: 'database',
        hasStoredApiKey: true,
        updatedAt: record?.updatedAt?.toISOString() || null,
      };
    }

    if (envApiKey) {
      return {
        apiKey: envApiKey,
        model,
        source: 'env',
        hasStoredApiKey: Boolean(record?.encryptedApiKey),
        updatedAt: record?.updatedAt?.toISOString() || null,
      };
    }

    return {
      apiKey: null,
      model,
      source: 'unset',
      hasStoredApiKey: Boolean(record?.encryptedApiKey),
      updatedAt: record?.updatedAt?.toISOString() || null,
    };
  }

  private normalizeMessages(messages: AssistantMessage[]) {
    return messages
      .map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }))
      .filter((message) => message.content.length > 0)
      .slice(-12);
  }

  private normalizePublicMessages(messages: AssistantMessage[]) {
    return messages
      .map((message) => ({
        role: message.role,
        content: message.content.trim().slice(0, PUBLIC_MAX_INPUT_LENGTH),
      }))
      .filter((message) => message.content.length > 0)
      .slice(-PUBLIC_HISTORY_LIMIT);
  }

  private buildAdminInstructions(taskLabel?: string) {
    const label = taskLabel?.trim()
      ? `Ưu tiên nhiệm vụ hiện tại: ${taskLabel.trim()}.`
      : '';

    return [
      'Bạn là trợ lý ChatGPT nội bộ của Moka Solar.',
      'Hãy trả lời bằng tiếng Việt, ngắn gọn, rõ ràng, thực dụng và phù hợp ngữ cảnh doanh nghiệp điện mặt trời tại Việt Nam.',
      'Khi thiếu dữ liệu, hãy nói rõ giả định thay vì bịa thêm thông tin.',
      'Nếu người dùng hỏi về nội dung website, billing, hợp đồng, khách hàng, ticket hoặc vận hành, hãy ưu tiên câu trả lời có thể áp dụng ngay.',
      label,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildPublicInstructions(pagePath?: string) {
    const pageContext = pagePath?.trim()
      ? `Khách đang xem trang: ${pagePath.trim()}.`
      : '';

    return [
      'Bạn là trợ lý công khai của Moka Solar trên website bán hàng.',
      'Chỉ trả lời về Moka Solar, điện mặt trời áp mái, mô hình PPA, thuê hệ thống, hybrid, trả góp, bảng giá, quy trình triển khai, cổng khách hàng, FAQ cơ bản và hỗ trợ khách hàng.',
      'Không trở thành chatbot đa năng cho các chủ đề ngoài phạm vi trên.',
      'Nếu câu hỏi cần báo giá chi tiết, khảo sát site, so sánh kỹ thuật sâu hoặc nằm ngoài phạm vi, hãy trả lời ngắn gọn và hướng khách để lại số điện thoại hoặc Zalo để đội ngũ tư vấn liên hệ.',
      'Giữ văn phong lịch sự, chuyên nghiệp, tối đa khoảng 120 từ, không dùng markdown dài dòng.',
      pageContext,
    ]
      .filter(Boolean)
      .join(' ');
  }

  private extractText(response: OpenAI.Responses.Response) {
    if (typeof response.output_text === 'string' && response.output_text.length) {
      return response.output_text;
    }

    const outputs = Array.isArray(response.output) ? response.output : [];
    const chunks: string[] = [];

    for (const output of outputs) {
      if (output.type !== 'message') {
        continue;
      }

      for (const item of output.content || []) {
        if (item.type === 'output_text' && item.text) {
          chunks.push(item.text);
        }
      }
    }

    return chunks.join('\n').trim();
  }

  private consumePublicQuota(clientIp: string, visitorId: string) {
    const now = Date.now();
    const key = `${clientIp || 'unknown'}:${visitorId || 'guest'}`;
    const current = this.publicBuckets.get(key);

    this.prunePublicBuckets(now);

    let bucket: PublicChatBucket =
      current && current.resetAt > now
        ? current
        : {
            used: 0,
            resetAt: now + PUBLIC_WINDOW_MS,
            lastMessageAt: 0,
            cooldownUntil: 0,
          };

    if (bucket.cooldownUntil > now) {
      const waitSeconds = Math.max(1, Math.ceil((bucket.cooldownUntil - now) / 1000));
      throw new HttpException(
        `Bạn đang gửi hơi nhanh. Vui lòng chờ khoảng ${waitSeconds} giây rồi thử lại.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (bucket.lastMessageAt && now - bucket.lastMessageAt < PUBLIC_SPAM_GAP_MS) {
      bucket.cooldownUntil = now + PUBLIC_COOLDOWN_MS;
      this.publicBuckets.set(key, bucket);

      throw new HttpException(
        `Để tránh spam, vui lòng chờ ${Math.ceil(PUBLIC_COOLDOWN_MS / 1000)} giây trước khi gửi tin nhắn tiếp theo.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (bucket.used >= PUBLIC_MAX_MESSAGES) {
      throw new HttpException(
        'Bạn đã dùng hết lượt hỏi nhanh cho phiên này. Vui lòng để lại số điện thoại hoặc Zalo để đội ngũ Moka Solar tư vấn chi tiết hơn.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket = {
      ...bucket,
      used: bucket.used + 1,
      lastMessageAt: now,
      cooldownUntil: 0,
    };

    this.publicBuckets.set(key, bucket);
    return bucket;
  }

  private prunePublicBuckets(now: number) {
    if (this.publicBuckets.size <= PUBLIC_BUCKET_LIMIT) {
      for (const [key, bucket] of this.publicBuckets.entries()) {
        if (bucket.resetAt <= now) {
          this.publicBuckets.delete(key);
        }
      }

      return;
    }

    const entries = [...this.publicBuckets.entries()].sort(
      (left, right) => left[1].lastMessageAt - right[1].lastMessageAt,
    );

    for (const [key] of entries.slice(0, entries.length - PUBLIC_BUCKET_LIMIT)) {
      this.publicBuckets.delete(key);
    }
  }

  private buildPublicFallbackResponse(options?: {
    model?: string;
    remainingMessages?: number;
    leadSuggested?: boolean;
    reply?: string;
  }) {
    return {
      id: `public-ai-${Date.now()}`,
      model: options?.model || this.resolvePublicModel(DEFAULT_OPENAI_MODEL),
      reply: options?.reply || this.buildPublicFallbackText(),
      createdAt: new Date().toISOString(),
      remainingMessages: options?.remainingMessages ?? PUBLIC_MAX_MESSAGES,
      leadSuggested: options?.leadSuggested ?? true,
    };
  }

  private buildPublicFallbackText(reason?: string) {
    return [
      reason || 'Trợ lý AI đang trả lời ở chế độ ngắn gọn.',
      'Moka Solar có thể hỗ trợ giới thiệu giải pháp, bảng giá, mô hình PPA/thuê/hybrid/trả góp và quy trình triển khai.',
      'Nếu bạn cần báo giá chi tiết, vui lòng để lại số điện thoại hoặc Zalo để đội ngũ tư vấn liên hệ trực tiếp.',
    ].join(' ');
  }

  private describePublicError(error: unknown) {
    const status = this.extractStatus(error);

    if (status === 401 || status === 403) {
      return 'Cấu hình AI đang cần được kiểm tra lại.';
    }

    if (status === 429) {
      return 'Trợ lý AI đang bận hoặc vượt giới hạn tạm thời.';
    }

    return 'Hiện chưa thể trả lời ngay bằng AI.';
  }

  private shouldSuggestLead(lastUserMessage: string, reply: string) {
    const source = `${lastUserMessage} ${reply}`.toLowerCase();

    return [
      'báo giá',
      'bao gia',
      'giá',
      'gia',
      'zalo',
      'số điện thoại',
      'so dien thoai',
      'liên hệ',
      'lien he',
      'khảo sát',
      'khao sat',
      'triển khai',
      'tu van',
      'tư vấn',
    ].some((keyword) => source.includes(keyword));
  }

  private resolvePublicModel(defaultModel: string) {
    return (
      this.configService.get<string>('OPENAI_WEBSITE_MODEL')?.trim() ||
      this.configService.get<string>('OPENAI_WEBCHAT_MODEL')?.trim() ||
      defaultModel ||
      DEFAULT_PUBLIC_OPENAI_MODEL
    );
  }

  private isWebsiteAiEnabled() {
    return this.configService.get<string>('WEBSITE_AI_CHAT_ENABLED') !== 'false';
  }

  private buildActionInstructions(dto: RunAiActionDto) {
    const actionLabel = this.defaultActionTitle(dto.actionType);

    return [
      'Ban la tro ly AI noi bo cua Moka Solar.',
      `Tac vu hien tai: ${actionLabel}.`,
      'Hay tra loi bang tieng Viet, ngan gon, sang, de ap dung ngay cho boi canh doanh nghiep nang luong mat troi.',
      'Neu tao noi dung, uu tien giong dieu premium, ro loi ich, khong viet kieu release note noi bo.',
      'Neu la nhac hoa don, giu van phong lich su, ro so tien, han thanh toan va huong dan lien he.',
      'Chi tra ve phan noi dung de ap dung, khong viet them mo dau metacommentary.',
    ].join(' ');
  }

  private buildActionPrompt(dto: RunAiActionDto) {
    return [
      dto.title?.trim() ? `Tieu de/Tac vu: ${dto.title.trim()}` : null,
      dto.targetType?.trim() ? `Loai dich: ${dto.targetType.trim()}` : null,
      dto.targetId?.trim() ? `Ma doi tuong: ${dto.targetId.trim()}` : null,
      `Yeu cau chinh:\n${dto.instruction.trim()}`,
      dto.context?.trim() ? `Boi canh bo sung:\n${dto.context.trim()}` : null,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  private serializeDraft(draft: any): AiActionDraftRecord {
    return {
      id: draft.id,
      actionType: draft.actionType,
      title: draft.title,
      prompt: draft.prompt || null,
      content: draft.content,
      targetType: draft.targetType || null,
      targetId: draft.targetId || null,
      status: draft.status,
      metadata:
        draft.metadata && typeof draft.metadata === 'object' && !Array.isArray(draft.metadata)
          ? draft.metadata
          : null,
      appliedAt: draft.appliedAt?.toISOString?.() || null,
      createdAt: draft.createdAt.toISOString(),
      updatedAt: draft.updatedAt.toISOString(),
    };
  }

  private defaultActionTitle(actionType: string) {
    const labels: Record<string, string> = {
      WRITE_ARTICLE: 'Viet bai',
      EDIT_CONTENT: 'Sua noi dung',
      GENERATE_FAQ: 'Tao FAQ',
      INVOICE_REMINDER: 'Soan nhac hoa don',
      CUSTOMER_MESSAGE: 'Soan tin nhan cho khach',
    };

    return labels[actionType] || actionType;
  }

  private defaultTargetType(actionType: string) {
    if (actionType === 'INVOICE_REMINDER') {
      return 'INVOICE_REMINDER';
    }

    return 'CONTENT_POST';
  }

  private defaultContentTags(actionType: string) {
    const tags: Record<string, string[]> = {
      WRITE_ARTICLE: ['marketing', 'ai-draft'],
      EDIT_CONTENT: ['content', 'ai-draft'],
      GENERATE_FAQ: ['faq', 'ai-draft'],
      CUSTOMER_MESSAGE: ['crm', 'ai-draft'],
      INVOICE_REMINDER: ['finance', 'ai-draft'],
    };

    return tags[actionType] || ['ai-draft'];
  }

  private matchesReminderTemplate(
    templateType: 'UPCOMING' | 'DUE' | 'OVERDUE',
    diffDays: number,
    invoiceStatus: string,
  ) {
    if (templateType === 'OVERDUE') {
      return diffDays < 0 || invoiceStatus === 'OVERDUE';
    }

    if (templateType === 'DUE') {
      return diffDays === 0;
    }

    return diffDays > 0 && diffDays <= 3;
  }

  private buildReminderTemplate(invoice: any, templateType: 'UPCOMING' | 'DUE' | 'OVERDUE') {
    const customerName =
      invoice.customer?.companyName || invoice.customer?.user?.fullName || 'Quy khach';
    const amount = Number(invoice.totalAmount || 0).toLocaleString('vi-VN');
    const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('vi-VN') : '-';
    const invoiceCode = invoice.invoiceNumber;
    const period = `${String(invoice.billingMonth).padStart(2, '0')}/${invoice.billingYear}`;
    const titleMap = {
      UPCOMING: `Nhac thanh toan truoc han - ${invoiceCode}`,
      DUE: `Nhac thanh toan den han - ${invoiceCode}`,
      OVERDUE: `Nhac thanh toan qua han - ${invoiceCode}`,
    };
    const introMap = {
      UPCOMING: `Moka Solar xin nhac Quy khach ve hoa don ${invoiceCode} cua ky ${period}, sap den han thanh toan vao ngay ${dueDate}.`,
      DUE: `Hom nay la han thanh toan cua hoa don ${invoiceCode} (ky ${period}). Moka Solar gui nhac de Quy khach chu dong doi soat.`,
      OVERDUE: `Hoa don ${invoiceCode} cua ky ${period} da qua han thanh toan. Moka Solar xin gui thong bao de Quy khach sap xep doi soat som.`,
    };

    return {
      title: titleMap[templateType],
      content: [
        `Kinh gui ${customerName},`,
        introMap[templateType],
        `Tong so tien can thanh toan: ${amount} d.`,
        'Neu Quy khach da chuyen khoan, vui long gui bien lai de doi van hanh xac nhan. Neu can ho tro, vui long lien he hotline hoac Zalo Moka Solar.',
      ].join('\n\n'),
    };
  }

  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  }

  private decrypt(value: string) {
    try {
      const [ivBase64, authTagBase64, payloadBase64] = value.split(':');

      if (!ivBase64 || !authTagBase64 || !payloadBase64) {
        return null;
      }

      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getEncryptionKey(),
        Buffer.from(ivBase64, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(authTagBase64, 'base64'));

      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(payloadBase64, 'base64')),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      return null;
    }
  }

  private getEncryptionKey() {
    const secret =
      this.configService.get<string>('AI_SETTINGS_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'moka-solar-ai-settings';

    return createHash('sha256').update(secret).digest();
  }

  private extractStatus(error: unknown) {
    return typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof (error as { status?: unknown }).status === 'number'
      ? Number((error as { status: number }).status)
      : null;
  }

  private handleOpenAiError(error: unknown): never {
    const status = this.extractStatus(error);

    if (status === 401 || status === 403) {
      throw new UnauthorizedException(
        'OpenAI API key không hợp lệ hoặc không còn quyền truy cập. Vui lòng kiểm tra lại khóa trong màn admin.',
      );
    }

    if (status === 429) {
      throw new ServiceUnavailableException(
        'Tài khoản OpenAI hiện đã hết quota hoặc đang bị giới hạn tốc độ. Vui lòng kiểm tra billing của OpenAI rồi thử lại.',
      );
    }

    if (status && status >= 400 && status < 500) {
      throw new BadRequestException(
        'Yêu cầu gửi tới OpenAI chưa hợp lệ. Vui lòng kiểm tra lại model, API key hoặc nội dung bạn vừa gửi.',
      );
    }

    throw new ServiceUnavailableException(
      'Không thể kết nối OpenAI ở thời điểm này. Vui lòng thử lại sau ít phút.',
    );
  }
}
