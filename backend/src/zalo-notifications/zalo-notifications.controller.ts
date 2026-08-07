import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ZaloAutomationService } from './zalo-automation.service';
import { ZaloNotificationsService } from './zalo-notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { SendZaloInvoiceDto } from './dto/send-zalo-invoice.dto';
import { TestZaloConnectionDto } from './dto/test-zalo-connection.dto';
import { UpdateZaloSettingsDto } from './dto/update-zalo-settings.dto';

@Controller('zalo-notifications')
@FeaturePlugin('billing')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class ZaloNotificationsController {
  constructor(
    private readonly zaloNotificationsService: ZaloNotificationsService,
    private readonly zaloAutomationService: ZaloAutomationService,
  ) {}

  @Get('status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  getStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.zaloNotificationsService.getStatus(user);
  }

  @Get('settings')
  @Roles('SUPER_ADMIN', 'ADMIN')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.zaloNotificationsService.getSettings(user);
  }

  @Patch('settings')
  @Roles('SUPER_ADMIN', 'ADMIN')
  updateSettings(
    @Body() dto: UpdateZaloSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.zaloNotificationsService.updateSettings(dto, user.sub);
  }

  @Get('logs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  listLogs(
    @Query('invoiceId') invoiceId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.zaloNotificationsService.listLogs({
      invoiceId: invoiceId?.trim() || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('test')
  @Roles('SUPER_ADMIN', 'ADMIN')
  testConnection(
    @Body() dto: TestZaloConnectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.zaloNotificationsService.testConnection(dto, user.sub);
  }


  @Get('automation/status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  getAutomationStatus() {
    return this.zaloAutomationService.getStatus();
  }

  @Post('automation/run')
  @Roles('SUPER_ADMIN', 'ADMIN')
  runAutomation(
    @Query('dryRun') dryRun: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const forceDryRun = dryRun === undefined ? true : dryRun.toLowerCase() !== 'false';
    return this.zaloAutomationService.runNow(user.sub, forceDryRun);
  }

  @Post('invoices/:invoiceId/send')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  sendInvoiceNotification(
    @Param('invoiceId') invoiceId: string,
    @Body() dto: SendZaloInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.zaloNotificationsService.sendInvoiceNotification({
      invoiceId,
      actorId: user.sub,
      templateType: dto.templateType,
      recipientPhone: dto.recipientPhone,
      dryRun: dto.dryRun,
    });
  }
}
