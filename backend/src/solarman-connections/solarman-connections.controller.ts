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
import { CreateSolarmanConnectionDto } from './dto/create-solarman-connection.dto';
import { SyncSolarmanConnectionDto } from './dto/sync-solarman-connection.dto';
import { UpdateSolarmanConnectionDto } from './dto/update-solarman-connection.dto';
import { SolarmanConnectionsService } from './solarman-connections.service';

@Controller('solarman-connections')
@FeaturePlugin('solarman_connections')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class SolarmanConnectionsController {
  constructor(
    private readonly solarmanConnectionsService: SolarmanConnectionsService,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  list() {
    return this.solarmanConnectionsService.listConnections();
  }

  @Get(':id/logs')
  @Roles('SUPER_ADMIN', 'ADMIN')
  listLogs(@Param('id') id: string) {
    return this.solarmanConnectionsService.listLogs(id);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  findOne(@Param('id') id: string) {
    return this.solarmanConnectionsService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(
    @Body() dto: CreateSolarmanConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.solarmanConnectionsService.create(dto, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSolarmanConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.solarmanConnectionsService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.solarmanConnectionsService.remove(id, actor.sub);
  }

  @Post(':id/test')
  @Roles('SUPER_ADMIN', 'ADMIN')
  testConnection(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.solarmanConnectionsService.testConnection(id, actor.sub);
  }

  @Post(':id/sync')
  @Roles('SUPER_ADMIN', 'ADMIN')
  syncNow(
    @Param('id') id: string,
    @Body() dto: SyncSolarmanConnectionDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.solarmanConnectionsService.syncNow(id, dto, actor.sub);
  }
}
