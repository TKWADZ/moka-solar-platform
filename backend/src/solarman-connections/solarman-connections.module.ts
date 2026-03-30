import { Module } from '@nestjs/common';
import { MonthlyPvBillingsModule } from '../monthly-pv-billings/monthly-pv-billings.module';
import { SolarmanConnectionsController } from './solarman-connections.controller';
import { SolarmanClientService } from './solarman-client.service';
import { SolarmanConnectionsService } from './solarman-connections.service';

@Module({
  imports: [MonthlyPvBillingsModule],
  controllers: [SolarmanConnectionsController],
  providers: [SolarmanConnectionsService, SolarmanClientService],
  exports: [SolarmanConnectionsService],
})
export class SolarmanConnectionsModule {}
