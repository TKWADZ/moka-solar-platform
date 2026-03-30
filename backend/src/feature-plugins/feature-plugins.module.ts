import { Global, Module } from '@nestjs/common';
import { FeaturePluginsController } from './feature-plugins.controller';
import { FeaturePluginGuard } from './feature-plugin.guard';
import { FeaturePluginsService } from './feature-plugins.service';

@Global()
@Module({
  controllers: [FeaturePluginsController],
  providers: [FeaturePluginsService, FeaturePluginGuard],
  exports: [FeaturePluginsService, FeaturePluginGuard],
})
export class FeaturePluginsModule {}
