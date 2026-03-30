import { Controller, Get, Param, Res } from '@nestjs/common';
import { MediaService } from './media.service';

@Controller('media')
export class MediaPublicController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':id/file')
  async file(@Param('id') id: string, @Res() res: any) {
    const media = await this.mediaService.resolveFile(id);

    res.setHeader('Content-Type', media.mimeType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(media.originalName)}"`,
    );
    return res.sendFile(media.filePath);
  }
}
