import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [FormsController],
  providers: [FormsService],
})
export class FormsModule {}
