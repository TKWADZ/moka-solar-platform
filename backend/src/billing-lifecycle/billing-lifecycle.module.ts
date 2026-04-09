import { Module } from '@nestjs/common';
import { DeyeConnectionsModule } from '../deye-connections/deye-connections.module';
import { EnergyRecordsModule } from '../energy-records/energy-records.module';
import { LuxPowerConnectionsModule } from '../luxpower-connections/luxpower-connections.module';
import { MonthlyPvBillingsModule } from '../monthly-pv-billings/monthly-pv-billings.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ZaloNotificationsModule } from '../zalo-notifications/zalo-notifications.module';
import { BillingLifecycleService } from './billing-lifecycle.service';

@Module({
  imports: [
    PrismaModule,
    MonthlyPvBillingsModule,
    EnergyRecordsModule,
    DeyeConnectionsModule,
    LuxPowerConnectionsModule,
    ZaloNotificationsModule,
  ],
  providers: [BillingLifecycleService],
  exports: [BillingLifecycleService],
})
export class BillingLifecycleModule {}
