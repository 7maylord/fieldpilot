import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsController } from './notifications.controller';
import { NotificationWorker } from './notification-worker.service';
import { NotificationStream } from './notification-stream.service';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationWorker, NotificationStream],
  exports: [NotificationWorker],
})
export class NotificationsModule {}
