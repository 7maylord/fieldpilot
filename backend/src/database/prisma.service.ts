import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { loadConfig } from '../config/app.config';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    super({ datasourceUrl: loadConfig().databaseUrl });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
