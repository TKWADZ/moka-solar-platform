import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { WebsiteSettingsController } from './website-settings.controller';
import { WebsiteSettingsService } from './website-settings.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [WebsiteSettingsController],
  providers: [WebsiteSettingsService],
  exports: [WebsiteSettingsService],
})
export class WebsiteSettingsModule {}
