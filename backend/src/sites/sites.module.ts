import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { SitesController } from './sites.controller';
import { SitesService } from './sites.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [SitesController],
  providers: [SitesService],
})
export class SitesModule {}
