import { Module } from '@nestjs/common';
import { SemsPlusModule } from '../sems-plus/sems-plus.module';
import { EnergyRecordsController } from './energy-records.controller';
import { EnergyRecordsService } from './energy-records.service';
import { SemsPortalService } from './sems-portal.service';
import { SolarmanService } from './solarman.service';

@Module({
  imports: [SemsPlusModule],
  controllers: [EnergyRecordsController],
  providers: [EnergyRecordsService, SemsPortalService, SolarmanService],
  exports: [EnergyRecordsService],
})
export class EnergyRecordsModule {}
