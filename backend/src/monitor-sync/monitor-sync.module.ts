import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DeyeConnectionsModule } from '../deye-connections/deye-connections.module';
import { EnergyRecordsModule } from '../energy-records/energy-records.module';
import { LuxPowerConnectionsModule } from '../luxpower-connections/luxpower-connections.module';
import { MonthlyPvBillingsModule } from '../monthly-pv-billings/monthly-pv-billings.module';
import { MonitorSyncService } from './monitor-sync.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EnergyRecordsModule,
    DeyeConnectionsModule,
    LuxPowerConnectionsModule,
    MonthlyPvBillingsModule,
  ],
  providers: [MonitorSyncService],
  exports: [MonitorSyncService],
})
export class MonitorSyncModule {}
