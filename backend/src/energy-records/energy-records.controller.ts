import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { EnergyRecordsService } from './energy-records.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateEnergyRecordDto } from './dto/create-energy-record.dto';
import { UpdateEnergyRecordDto } from './dto/update-energy-record.dto';
import { MockSyncDto } from './dto/mock-sync.dto';
import { SemsSyncDto } from './dto/sems-sync.dto';
import { SolarmanSyncDto } from './dto/solarman-sync.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';

@Controller('energy-records')
@FeaturePlugin('energy_records')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class EnergyRecordsController {
  constructor(private readonly energyRecordsService: EnergyRecordsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  findAll(@Query('systemId') systemId?: string) {
    return this.energyRecordsService.findAll(systemId);
  }

  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.energyRecordsService.findMine(user.customerId!);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: CreateEnergyRecordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.energyRecordsService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEnergyRecordDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.energyRecordsService.update(id, dto, actor.sub);
  }

  @Post('mock-sync/:systemId')
  @Roles('SUPER_ADMIN', 'ADMIN')
  mockSync(
    @Param('systemId') systemId: string,
    @Body() dto: MockSyncDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.energyRecordsService.mockSync(systemId, dto.days || 30, actor.sub);
  }

  @Post('sems-preview')
  @Roles('SUPER_ADMIN', 'ADMIN')
  semsPreview(@Body() dto: SemsSyncDto) {
    return this.energyRecordsService.previewSems(dto);
  }

  @Post('solarman-preview')
  @Roles('SUPER_ADMIN', 'ADMIN')
  solarmanPreview(@Body() dto: SolarmanSyncDto) {
    return this.energyRecordsService.previewSolarman(dto);
  }

  @Post('sems-sync/:systemId')
  @Roles('SUPER_ADMIN', 'ADMIN')
  semsSync(
    @Param('systemId') systemId: string,
    @Body() dto: SemsSyncDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.energyRecordsService.syncFromSems(systemId, dto, actor.sub);
  }

  @Post('solarman-sync/:systemId')
  @Roles('SUPER_ADMIN', 'ADMIN')
  solarmanSync(
    @Param('systemId') systemId: string,
    @Body() dto: SolarmanSyncDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.energyRecordsService.syncFromSolarman(systemId, dto, actor.sub);
  }
}
