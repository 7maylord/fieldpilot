import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseModule } from '../database/database.module';
import { MalwareScanner } from './malware-scanner.service';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { S3Service } from './s3.service';

@Module({
  imports: [DatabaseModule, AuditModule],
  controllers: [MediaController],
  providers: [MediaService, S3Service, MalwareScanner],
})
export class MediaModule {}
