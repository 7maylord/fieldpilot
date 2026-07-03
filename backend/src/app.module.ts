import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CsrfGuard } from './auth/csrf.guard';
import { SessionAuthGuard } from './auth/session-auth.guard';
import { CapabilityGuard } from './authorization/capability.guard';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { RequestTelemetryMiddleware } from './common/request-telemetry.middleware';
import { DatabaseModule } from './database/database.module';
import { DevicesModule } from './devices/devices.module';
import { HealthController } from './health/health.controller';
import { OrganizationsModule } from './organizations/organizations.module';
import { ProjectsModule } from './projects/projects.module';
import { QueueModule } from './queue/queue.module';
import { SitesModule } from './sites/sites.module';
import { SyncModule } from './sync/sync.module';
import { WorkOrdersModule } from './work-orders/work-orders.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    DatabaseModule,
    DevicesModule,
    AuditModule,
    QueueModule,
    AuthModule,
    OrganizationsModule,
    ProjectsModule,
    SitesModule,
    SyncModule,
    WorkOrdersModule,
  ],
  controllers: [HealthController],
  providers: [
    RequestIdMiddleware,
    RequestTelemetryMiddleware,
    CapabilityGuard,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useExisting: CapabilityGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(RequestIdMiddleware, RequestTelemetryMiddleware)
      .forRoutes('*splat');
  }
}
