import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ZaloNotificationsService } from './zalo-notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { SendZaloInvoiceDto } from './dto/send-zalo-invoice.dto';

@Controller('zalo-notifications')
@FeaturePlugin('billing')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class ZaloNotificationsController {
  constructor(private readonly zaloNotificationsService: ZaloNotificationsService) {}

  @Get('status')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  getStatus() {
    return this.zaloNotificationsService.getStatus();
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
