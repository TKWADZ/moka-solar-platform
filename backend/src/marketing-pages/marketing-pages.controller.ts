import {
  Controller,
  Get,
  Param,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { UpdateMarketingPageDto } from './dto/update-marketing-page.dto';
import { MarketingPagesService } from './marketing-pages.service';

@Controller('marketing-pages')
export class MarketingPagesController {
  constructor(
    private readonly marketingPagesService: MarketingPagesService,
  ) {}

  @Get('public')
  @FeaturePlugin('marketing_pages')
  @UseGuards(FeaturePluginGuard)
  findPublished() {
    return this.marketingPagesService.findPublished();
  }

  @Get('public/:key')
  @FeaturePlugin('marketing_pages')
  @UseGuards(FeaturePluginGuard)
  findPublishedByKey(@Param('key') key: string) {
    return this.marketingPagesService.findPublishedByKey(key);
  }

  @Get()
  @FeaturePlugin('marketing_pages')
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  findAll() {
    return this.marketingPagesService.findAll();
  }

  @Get(':key')
  @FeaturePlugin('marketing_pages')
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  findOne(@Param('key') key: string) {
    return this.marketingPagesService.findOne(key);
  }

  @Patch(':key')
  @FeaturePlugin('marketing_pages')
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('key') key: string,
    @Body() dto: UpdateMarketingPageDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.marketingPagesService.update(key, dto, actor.sub);
  }
}
