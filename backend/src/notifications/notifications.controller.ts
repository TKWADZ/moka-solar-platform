import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { AuthenticatedUser } from '../common/types/authenticated-user.type';
import { FeaturePlugin } from '../feature-plugins/feature-plugin.decorator';
import { FeaturePluginGuard } from '../feature-plugins/feature-plugin.guard';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@FeaturePlugin('notifications')
@UseGuards(JwtAuthGuard, RolesGuard, FeaturePluginGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('me')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.findMine(user.sub);
  }

  @Post()
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() dto: CreateNotificationDto) {
    return this.notificationsService.create(dto);
  }

  @Patch(':id/read')
  @Roles('SUPER_ADMIN', 'ADMIN', 'CUSTOMER')
  markRead(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.notificationsService.markRead(id, user.sub);
  }
}
