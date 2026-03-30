import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeaturePluginsService } from './feature-plugins.service';
import { FEATURE_PLUGIN_KEY } from './feature-plugin.decorator';

@Injectable()
export class FeaturePluginGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private featurePluginsService: FeaturePluginsService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const pluginKey = this.reflector.getAllAndOverride<string>(FEATURE_PLUGIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!pluginKey) {
      return true;
    }

    await this.featurePluginsService.assertActive(pluginKey);
    return true;
  }
}
