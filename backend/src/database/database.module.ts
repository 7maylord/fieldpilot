import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TenantDatabase } from './tenant-database.service';

@Global()
@Module({
  providers: [PrismaService, TenantDatabase],
  exports: [PrismaService, TenantDatabase],
})
export class DatabaseModule {}
