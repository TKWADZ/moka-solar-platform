import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { UpdateWebsiteSettingsDto } from './dto/update-website-settings.dto';
import { WebsiteSettingsService } from './website-settings.service';

@Controller('website-settings')
@FeaturePlugin('website_settings')
export class WebsiteSettingsController {
  constructor(
    private readonly websiteSettingsService: WebsiteSettingsService,
  ) {}

  @Get('public')
  @UseGuards(FeaturePluginGuard)
  findPublicSite() {
    return this.websiteSettingsService.findPublicSite();
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  findAdminSiteSettings() {
    return this.websiteSettingsService.findPublicSite();
  }

  @Patch()
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  updatePublicSite(
    @Body() dto: UpdateWebsiteSettingsDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.websiteSettingsService.updatePublicSite(dto, actor.sub);
  }
}
