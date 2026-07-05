import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { DefectsController } from './defects.controller';
import { DefectsService } from './defects.service';
@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [DefectsController],
  providers: [DefectsService],
})
export class DefectsModule {}
