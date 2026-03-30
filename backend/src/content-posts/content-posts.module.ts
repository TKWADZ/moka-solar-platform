import { Module } from '@nestjs/common';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { PrismaModule } from '../prisma/prisma.module';
import { FeaturePluginsModule } from '../feature-plugins/feature-plugins.module';
import { ContentPostsController } from './content-posts.controller';
import { ContentPostsService } from './content-posts.service';

@Module({
  imports: [PrismaModule, AuditLogsModule, FeaturePluginsModule],
  controllers: [ContentPostsController],
  providers: [ContentPostsService],
  exports: [ContentPostsService],
})
export class ContentPostsModule {}
