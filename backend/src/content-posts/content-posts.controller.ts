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
import { ContentPostsService } from './content-posts.service';
import { CreateContentPostDto } from './dto/create-content-post.dto';
import { UpdateContentPostDto } from './dto/update-content-post.dto';

@Controller('content-posts')
export class ContentPostsController {
  constructor(private readonly contentPostsService: ContentPostsService) {}

  @Get('public')
  @FeaturePlugin('content_posts')
  @UseGuards(FeaturePluginGuard)
  findPublished() {
    return this.contentPostsService.findPublished();
  }

  @Get('public/:slug')
  @FeaturePlugin('content_posts')
  @UseGuards(FeaturePluginGuard)
  findPublishedBySlug(@Param('slug') slug: string) {
    return this.contentPostsService.findPublishedBySlug(slug);
  }

  @Get()
  @FeaturePlugin('content_posts')
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  findAll() {
    return this.contentPostsService.findAll();
  }

  @Post()
  @FeaturePlugin('content_posts')
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: CreateContentPostDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.contentPostsService.create(dto, actor.sub);
  }

  @Patch(':id')
  @FeaturePlugin('content_posts')
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContentPostDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.contentPostsService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @FeaturePlugin('content_posts')
  @UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.contentPostsService.remove(id, actor.sub);
  }
}
