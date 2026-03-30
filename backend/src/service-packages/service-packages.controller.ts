import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { CreateServicePackageDto } from './dto/create-service-package.dto';
import { UpdateServicePackageDto } from './dto/update-service-package.dto';
import { ServicePackagesService } from './service-packages.service';

@Controller('service-packages')
@FeaturePlugin('service_packages')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class ServicePackagesController {
  constructor(private readonly servicePackagesService: ServicePackagesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER')
  findAll() {
    return this.servicePackagesService.findAll();
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER')
  findOne(@Param('id') id: string) {
    return this.servicePackagesService.findOne(id);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: CreateServicePackageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.servicePackagesService.create(dto, user.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateServicePackageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.servicePackagesService.update(id, dto, user.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.servicePackagesService.remove(id, user.sub);
  }
}
