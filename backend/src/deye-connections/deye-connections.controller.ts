import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { CreateDeyeConnectionDto } from './dto/create-deye-connection.dto';
import { SyncDeyeConnectionDto } from './dto/sync-deye-connection.dto';
import { UpdateDeyeConnectionDto } from './dto/update-deye-connection.dto';
import { DeyeConnectionsService } from './deye-connections.service';

@Controller('deye-connections')
@FeaturePlugin('deye_connections')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class DeyeConnectionsController {
  constructor(private readonly deyeConnectionsService: DeyeConnectionsService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  list() {
    return this.deyeConnectionsService.listConnections();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  findOne(@Param('id') id: string) {
    return this.deyeConnectionsService.findOne(id);
  }

  @Get(':id/logs')
  @Roles('SUPER_ADMIN', 'ADMIN')
  listLogs(@Param('id') id: string) {
    return this.deyeConnectionsService.listLogs(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(
    @Body() dto: CreateDeyeConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.deyeConnectionsService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeyeConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.deyeConnectionsService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deyeConnectionsService.remove(id, actor.sub);
  }

  @Post(':id/test')
  @Roles('SUPER_ADMIN', 'ADMIN')
  testConnection(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deyeConnectionsService.testConnection(id, actor.sub);
  }

  @Post(':id/sync-stations')
  @Roles('SUPER_ADMIN', 'ADMIN')
  syncStations(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deyeConnectionsService.syncStations(id, actor.sub);
  }

  @Post(':id/sync-monthly-history')
  @Roles('SUPER_ADMIN', 'ADMIN')
  syncMonthlyHistory(
    @Param('id') id: string,
    @Body() dto: SyncDeyeConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.deyeConnectionsService.syncMonthlyHistory(id, dto, actor.sub);
  }

  @Post(':id/sync')
  @Roles('SUPER_ADMIN', 'ADMIN')
  syncNow(
    @Param('id') id: string,
    @Body() dto: SyncDeyeConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.deyeConnectionsService.syncNow(id, dto, actor.sub);
  }
}
