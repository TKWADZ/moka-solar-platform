import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { ListMediaAssetsDto } from './dto/list-media-assets.dto';
import { UpdateMediaAssetDto } from './dto/update-media-asset.dto';
import { MediaService } from './media.service';

const MAX_MEDIA_FILE_SIZE = 8 * 1024 * 1024;

@Controller('media')
@FeaturePlugin('media_library')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN')
  list(@Query() query: ListMediaAssetsDto) {
    return this.mediaService.list(query);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  findOne(@Param('id') id: string) {
    return this.mediaService.findOne(id);
  }

  @Post('upload')
  @Roles('SUPER_ADMIN', 'ADMIN')
  @UseInterceptors(
    FilesInterceptor('files', 20, {
      limits: {
        fileSize: MAX_MEDIA_FILE_SIZE,
      },
    }),
  )
  upload(
    @UploadedFiles() files: Array<any>,
    @Body() body: Record<string, string>,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mediaService.uploadMany(files || [], body, actor.sub);
  }

  @Patch(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMediaAssetDto,
    @CurrentUser() actor: AuthenticatedUser,
  ) {
    return this.mediaService.update(id, dto, actor.sub);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.mediaService.remove(id, actor.sub);
  }
}
