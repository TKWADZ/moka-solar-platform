import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { SystemsService } from './systems.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CreateSystemDto } from './dto/create-system.dto';
import { PreviewDeyeStationsDto } from './dto/preview-deye-stations.dto';
import { ReportSystemDashboardPresenceDto } from './dto/report-system-dashboard-presence.dto';
import { SyncDeyeStationDto } from './dto/sync-deye-station.dto';
import { UpdateSystemDto } from './dto/update-system.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';

@Controller('systems')
@FeaturePlugin('systems')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class SystemsController {
  constructor(private readonly systemsService: SystemsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findAll() {
    return this.systemsService.findAll();
  }

  @Get('me')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.systemsService.findMine(user.customerId!);
  }

  @Post('dashboard-presence')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER')
  reportDashboardPresence(
    @Body() dto: ReportSystemDashboardPresenceDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.systemsService.reportDashboardPresence(dto, actor);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  findOne(@Param('id') id: string) {
    return this.systemsService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  create(@Body() dto: CreateSystemDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.systemsService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSystemDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.systemsService.update(id, dto, actor.sub);
  }

  @Post(':id/deye-preview')
  @Roles('SUPER_ADMIN', 'ADMIN')
  previewDeyeStations(@Param('id') id: string, @Body() dto: PreviewDeyeStationsDto) {
    return this.systemsService.previewDeyeStations(id, dto.connectionId);
  }

  @Post(':id/deye-sync')
  @Roles('SUPER_ADMIN', 'ADMIN')
  syncDeyeStation(
    @Param('id') id: string,
    @Body() dto: SyncDeyeStationDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.systemsService.syncDeyeStation(id, dto.connectionId, dto.stationId, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.systemsService.remove(id, actor.sub);
  }
}
