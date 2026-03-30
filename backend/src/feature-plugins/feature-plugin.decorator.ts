import { SetMetadata } from '@nestjs/common';

export const FEATURE_PLUGIN_KEY = 'feature_plugin_key';
export const FeaturePlugin = (pluginKey: string) => SetMetadata(FEATURE_PLUGIN_KEY, pluginKey);
