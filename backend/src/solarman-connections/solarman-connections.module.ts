import { Module } from '@nestjs/common';
import { MonthlyPvBillingsModule } from '../monthly-pv-billings/monthly-pv-billings.module';
import { SolarmanCookieSessionProvider } from './solarman-cookie-session.provider';
import { SolarmanConnectionsController } from './solarman-connections.controller';
import { SolarmanClientService } from './solarman-client.service';
import { SolarmanConnectionsService } from './solarman-connections.service';
import { SolarmanManualImportProvider } from './solarman-manual-import.provider';
import { SolarmanOfficialOpenApiProvider } from './solarman-official-openapi.provider';
import { SolarmanProviderRegistry } from './solarman-provider.registry';

@Module({
  imports: [MonthlyPvBillingsModule],
  controllers: [SolarmanConnectionsController],
  providers: [
    SolarmanConnectionsService,
    SolarmanClientService,
    SolarmanOfficialOpenApiProvider,
    SolarmanCookieSessionProvider,
    SolarmanManualImportProvider,
    SolarmanProviderRegistry,
  ],
  exports: [SolarmanConnectionsService],
})
export class SolarmanConnectionsModule {}
