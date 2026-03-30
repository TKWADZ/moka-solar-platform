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
import { CreateFeaturePluginDto } from './dto/create-feature-plugin.dto';
import { UpdateFeaturePluginDto } from './dto/update-feature-plugin.dto';
import { FeaturePluginsService } from './feature-plugins.service';

@Controller('feature-plugins')
export class FeaturePluginsController {
  constructor(private readonly featurePluginsService: FeaturePluginsService) {}

  @Get('catalog')
  findCatalog() {
    return this.featurePluginsService.findCatalog();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  findAll() {
    return this.featurePluginsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  findOne(@Param('id') id: string) {
    return this.featurePluginsService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(
    @Body() dto: CreateFeaturePluginDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.featurePluginsService.create(dto, actor.sub);
  }

  @Post('sync-defaults')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  syncDefaults(@CurrentUser() actor: AuthenticatedUser) {
    return this.featurePluginsService.syncDefaults(actor.sub);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateFeaturePluginDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.featurePluginsService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.featurePluginsService.remove(id, actor.sub);
  }
}
