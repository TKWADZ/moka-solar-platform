import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { WebsiteSettingsModule } from '../website-settings/website-settings.module';
import { ZaloAutomationService } from './zalo-automation.service';
import { ZaloNotificationsController } from './zalo-notifications.controller';
import { ZaloNotificationsService } from './zalo-notifications.service';
import { ZaloSettingsService } from './zalo-settings.service';

@Module({
  imports: [AuditLogsModule, WebsiteSettingsModule],
  controllers: [ZaloNotificationsController],
  providers: [ZaloSettingsService, ZaloNotificationsService, ZaloAutomationService],
  exports: [ZaloSettingsService, ZaloNotificationsService, ZaloAutomationService],
})
export class ZaloNotificationsModule {}
