import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MonthlyPvBillingsModule } from '../monthly-pv-billings/monthly-pv-billings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LuxPowerClientService } from './luxpower-client.service';
import { LuxPowerConnectionsController } from './luxpower-connections.controller';
import { LuxPowerConnectionsService } from './luxpower-connections.service';

@Module({
  imports: [PrismaModule, AuditLogsModule, MonthlyPvBillingsModule],
  controllers: [LuxPowerConnectionsController],
  providers: [LuxPowerClientService, LuxPowerConnectionsService],
  exports: [LuxPowerClientService, LuxPowerConnectionsService],
})
export class LuxPowerConnectionsModule {}
