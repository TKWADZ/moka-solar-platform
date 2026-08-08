import { Module } from '@nestjs/common';
import { DeyeConnectionsModule } from '../deye-connections/deye-connections.module';
import { LuxPowerConnectionsModule } from '../luxpower-connections/luxpower-connections.module';
import { SolarmanConnectionsModule } from '../solarman-connections/solarman-connections.module';
import { DeyePlantDiscoveryAdapter } from './provider-discovery/deye-plant-discovery.adapter';
import { LuxPowerPlantDiscoveryAdapter } from './provider-discovery/luxpower-plant-discovery.adapter';
import { ProviderDiscoveryRegistry } from './provider-discovery/provider-discovery.registry';
import { ProviderPlantDiscoveryService } from './provider-discovery/provider-plant-discovery.service';
import { SemsPlusPlantDiscoveryAdapter } from './provider-discovery/sems-plus-plant-discovery.adapter';
import { SolarmanPlantDiscoveryAdapter } from './provider-discovery/solarman-plant-discovery.adapter';
import { SystemsController } from './systems.controller';
import { SystemsService } from './systems.service';
@Module({
  imports: [DeyeConnectionsModule, SolarmanConnectionsModule, LuxPowerConnectionsModule],
  controllers: [SystemsController],
  providers: [
    SystemsService,
    ProviderPlantDiscoveryService,
    ProviderDiscoveryRegistry,
    DeyePlantDiscoveryAdapter,
    SolarmanPlantDiscoveryAdapter,
    LuxPowerPlantDiscoveryAdapter,
    SemsPlusPlantDiscoveryAdapter,
  ],
})
export class SystemsModule {}
