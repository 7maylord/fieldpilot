import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { DefectsModule } from '../defects/defects.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [DatabaseModule, AuditModule, DefectsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
