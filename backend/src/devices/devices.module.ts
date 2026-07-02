import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
