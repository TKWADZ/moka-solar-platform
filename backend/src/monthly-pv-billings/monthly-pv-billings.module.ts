import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MonthlyPvBillingsController } from './monthly-pv-billings.controller';
import { MonthlyPvBillingsService } from './monthly-pv-billings.service';

@Module({
  imports: [PrismaModule, AuditLogsModule],
  controllers: [MonthlyPvBillingsController],
  providers: [MonthlyPvBillingsService],
  exports: [MonthlyPvBillingsService],
})
export class MonthlyPvBillingsModule {}
