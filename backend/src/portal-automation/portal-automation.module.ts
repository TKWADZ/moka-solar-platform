import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { OperationalDataModule } from '../operational-data/operational-data.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PortalAutomationService } from './portal-automation.service';

@Module({
  imports: [PrismaModule, OperationalDataModule, AuditLogsModule, AiModule],
  providers: [PortalAutomationService],
  exports: [PortalAutomationService],
})
export class PortalAutomationModule {}
