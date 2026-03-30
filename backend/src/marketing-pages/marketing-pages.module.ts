import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MarketingPagesController } from './marketing-pages.controller';
import { MarketingPagesService } from './marketing-pages.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [MarketingPagesController],
  providers: [MarketingPagesService],
  exports: [MarketingPagesService],
})
export class MarketingPagesModule {}
