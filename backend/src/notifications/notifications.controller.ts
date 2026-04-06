import {
  Body,
  Controller,
  Get,
  MessageEvent,
  Param,
  Patch,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './notifications.service';
import { RealtimeEventsService } from './realtime-events.service';

@Controller('notifications')
@FeaturePlugin('notifications')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly realtimeEventsService: RealtimeEventsService,
  ) {}

  @Get('me')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    return this.notificationsService.findMine(
      user.sub,
      Number.isFinite(parsedLimit) ? Number(parsedLimit) : undefined,
    );
  }

  @Get('unread-summary')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER')
  unreadSummary(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.getUnreadSummary(user.sub);
  }

  @Sse('stream')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER')
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return this.realtimeEventsService.connect(user.sub);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF')
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Patch('read-all')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER')
  markAllRead(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markAllRead(user.sub);
  }

  @Patch(':id/read')
  @Roles('SUPER_ADMIN', 'ADMIN', 'STAFF', 'CUSTOMER')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markRead(id, user.sub);
  }
}
