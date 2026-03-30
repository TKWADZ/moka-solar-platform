import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { WebsiteSettingsModule } from '../website-settings/website-settings.module';
import { ZaloNotificationsController } from './zalo-notifications.controller';
import { ZaloNotificationsService } from './zalo-notifications.service';

@Module({
  imports: [AuditLogsModule, WebsiteSettingsModule],
  controllers: [ZaloNotificationsController],
  providers: [ZaloNotificationsService],
  exports: [ZaloNotificationsService],
})
export class ZaloNotificationsModule {}
