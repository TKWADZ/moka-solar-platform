import { Module } from '@nestjs/common';
import { MonthlyPvBillingsModule } from '../monthly-pv-billings/monthly-pv-billings.module';
import { DeyeApiService } from './deye-api.service';
import { DeyeAuthService } from './deye-auth.service';
import { DeyeConnectionsController } from './deye-connections.controller';
import { DeyeConnectionsService } from './deye-connections.service';
import { DeyeHistorySyncService } from './deye-history-sync.service';
import { DeyeStationSyncService } from './deye-station-sync.service';
import { DeyeTelemetrySyncService } from './deye-telemetry-sync.service';

@Module({
  imports: [MonthlyPvBillingsModule],
  controllers: [DeyeConnectionsController],
  providers: [
    DeyeConnectionsService,
    DeyeApiService,
    DeyeAuthService,
    DeyeStationSyncService,
    DeyeHistorySyncService,
    DeyeTelemetrySyncService,
  ],
  exports: [
    DeyeConnectionsService,
    DeyeStationSyncService,
    DeyeHistorySyncService,
    DeyeTelemetrySyncService,
  ],
})
export class DeyeConnectionsModule {}
