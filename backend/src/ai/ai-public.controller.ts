import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { AiService } from './ai.service';
import { PublicAssistantChatDto } from './dto/public-assistant-chat.dto';

function extractClientIp(request: Request) {
  const forwarded = request.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() || request.ip || 'unknown';
  }

  if (Array.isArray(forwarded) && forwarded.length) {
    return forwarded[0] || request.ip || 'unknown';
  }

  return request.ip || 'unknown';
}

@Controller('ai')
export class AiPublicController {
  constructor(private readonly aiService: AiService) {}

  @Post('public-chat')
  @FeaturePlugin('website_ai_chat')
  @UseGuards(FeaturePluginGuard)
  async publicChat(@Body() dto: PublicAssistantChatDto, @Req() request: Request) {
    return this.aiService.publicChat(dto, extractClientIp(request));
  }
}
