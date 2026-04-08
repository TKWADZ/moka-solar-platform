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
import { CreateLuxPowerConnectionDto } from './dto/create-luxpower-connection.dto';
import { SyncLuxPowerConnectionDto } from './dto/sync-luxpower-connection.dto';
import { UpdateLuxPowerConnectionDto } from './dto/update-luxpower-connection.dto';
import { LuxPowerConnectionsService } from './luxpower-connections.service';

@Controller('luxpower-connections')
@FeaturePlugin('luxpower_connections')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class LuxPowerConnectionsController {
  constructor(
    private readonly luxPowerConnectionsService: LuxPowerConnectionsService,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.read')
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.luxPowerConnectionsService.listConnections(actor);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.read')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.luxPowerConnectionsService.findOne(id, actor);
  }

  @Get(':id/logs')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.read')
  listLogs(@Param('id') id: string) {
    return this.luxPowerConnectionsService.listLogs(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('integration.secrets.manage')
  create(
    @Body() dto: CreateLuxPowerConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.luxPowerConnectionsService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('integration.secrets.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLuxPowerConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.luxPowerConnectionsService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Permissions('integration.secrets.manage')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.luxPowerConnectionsService.remove(id, actor.sub);
  }

  @Post(':id/test')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.execute')
  testConnection(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.luxPowerConnectionsService.testConnection(id, actor.sub);
  }

  @Post(':id/pipeline-preview')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.execute')
  previewPipeline(
    @Param('id') id: string,
    @Body() dto: SyncLuxPowerConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.luxPowerConnectionsService.previewPipeline(id, dto, actor);
  }

  @Post(':id/sync')
  @Roles('SUPER_ADMIN', 'ADMIN', 'MANAGER')
  @Permissions('integrations.execute')
  syncNow(
    @Param('id') id: string,
    @Body() dto: SyncLuxPowerConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.luxPowerConnectionsService.syncNow(id, dto, actor.sub);
  }
}
