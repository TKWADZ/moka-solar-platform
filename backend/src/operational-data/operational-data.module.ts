import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MonthlyPvBillingsModule } from '../monthly-pv-billings/monthly-pv-billings.module';
import { OperationalDataController } from './operational-data.controller';
import { OperationalDataService } from './operational-data.service';

@Module({
  imports: [AuditLogsModule, MonthlyPvBillingsModule],
  controllers: [OperationalDataController],
  providers: [OperationalDataService],
  exports: [OperationalDataService],
})
export class OperationalDataModule {}
