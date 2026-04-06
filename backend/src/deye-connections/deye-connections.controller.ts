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
import { Permissions } from '../common/decorators/permissions.decorator';
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
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.read')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.deyeConnectionsService.listConnections(actor);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.read')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deyeConnectionsService.findOne(id, actor);
  }

  @Get(':id/logs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.read')
  listLogs(@Param('id') id: string) {
    return this.deyeConnectionsService.listLogs(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('integration.secrets.manage')
  create(
    @Body() dto: CreateDeyeConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.deyeConnectionsService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('integration.secrets.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDeyeConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.deyeConnectionsService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('integration.secrets.manage')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deyeConnectionsService.remove(id, actor.sub);
  }

  @Post(':id/test')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.execute')
  testConnection(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deyeConnectionsService.testConnection(id, actor.sub);
  }

  @Post(':id/sync-stations')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.execute')
  syncStations(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.deyeConnectionsService.syncStations(id, actor.sub);
  }

  @Post(':id/sync-monthly-history')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.execute')
  syncMonthlyHistory(
    @Param('id') id: string,
    @Body() dto: SyncDeyeConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.deyeConnectionsService.syncMonthlyHistory(id, dto, actor.sub);
  }

  @Post(':id/sync')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.execute')
  syncNow(
    @Param('id') id: string,
    @Body() dto: SyncDeyeConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.deyeConnectionsService.syncNow(id, dto, actor.sub);
  }
}
