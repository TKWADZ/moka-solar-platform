import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { AiService } from './ai.service';
import { ApplyAiActionDto } from './dto/apply-ai-action.dto';
import { AssistantChatDto } from './dto/assistant-chat.dto';
import { GenerateInvoiceRemindersDto } from './dto/generate-invoice-reminders.dto';
import { RunAiActionDto } from './dto/run-ai-action.dto';
import { SaveAiActionDraftDto } from './dto/save-ai-action-draft.dto';
import { UpdateAiSettingsDto } from './dto/update-ai-settings.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Get('status')
  async getStatus() {
    return this.aiService.getStatus();
  }

  @Get('settings')
  async getSettings() {
    return this.aiService.getSettings();
  }

  @Patch('settings')
  async updateSettings(
    @Body() dto: UpdateAiSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.aiService.updateSettings(dto, actor.sub);
  }

  @Post('chat')
  chat(@Body() dto: AssistantChatDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.aiService.chat(dto, actor.sub);
  }

  @Get('actions/drafts')
  listActionDrafts() {
    return this.aiService.listActionDrafts();
  }

  @Post('actions/run')
  runAction(@Body() dto: RunAiActionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.aiService.runAction(dto, actor.sub);
  }

  @Post('actions/drafts')
  saveDraft(@Body() dto: SaveAiActionDraftDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.aiService.saveDraft(dto, actor.sub);
  }

  @Post('actions/apply')
  applyAction(@Body() dto: ApplyAiActionDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.aiService.applyDraft(dto, actor.sub);
  }

  @Post('actions/reminders/generate')
  generateReminderDrafts(
    @Body() dto: GenerateInvoiceRemindersDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.aiService.generateInvoiceReminderDrafts(dto, actor.sub);
  }
}
