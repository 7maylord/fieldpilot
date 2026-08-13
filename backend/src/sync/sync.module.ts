import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { DefectsModule } from '../defects/defects.module';
import { SyncController } from './sync.controller';
import { SyncService } from './sync.service';

@Module({
  imports: [DatabaseModule, AuditModule, DefectsModule, AssetsModule],
  controllers: [SyncController],
  providers: [SyncService],
})
export class SyncModule {}
