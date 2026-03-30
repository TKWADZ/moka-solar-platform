import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { ContentPostsModule } from '../content-posts/content-posts.module';
import { FeaturePluginsModule } from '../feature-plugins/feature-plugins.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiPublicController } from './ai-public.controller';
import { AiService } from './ai.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    AuditLogsModule,
    FeaturePluginsModule,
    ContentPostsModule,
  ],
  controllers: [AiController, AiPublicController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
