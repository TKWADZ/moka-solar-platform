import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { FeaturePluginsModule } from '../feature-plugins/feature-plugins.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ContactInquiriesController } from './contact-inquiries.controller';
import { ContactInquiriesService } from './contact-inquiries.service';

@Module({
  imports: [PrismaModule, NotificationsModule, AuditLogsModule, FeaturePluginsModule],
  controllers: [ContactInquiriesController],
  providers: [ContactInquiriesService],
  exports: [ContactInquiriesService],
})
export class ContactInquiriesModule {}
