import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { MediaController } from './media.controller';
import { MediaPublicController } from './media-public.controller';
import { MediaService } from './media.service';

@Module({
  imports: [AuditLogsModule],
  controllers: [MediaController, MediaPublicController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
