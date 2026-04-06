import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { RealtimeEventsService } from './realtime-events.service';

@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, RealtimeEventsService],
  exports: [NotificationsService, RealtimeEventsService],
})
export class NotificationsModule {}
