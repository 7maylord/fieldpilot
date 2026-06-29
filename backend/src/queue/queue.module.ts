import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { OutboxPublisher } from './outbox-publisher.service';

@Global()
@Module({
  providers: [QueueService, OutboxPublisher],
  exports: [QueueService, OutboxPublisher],
})
export class QueueModule {}
