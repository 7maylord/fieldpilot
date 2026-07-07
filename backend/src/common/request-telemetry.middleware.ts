import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class RequestTelemetryMiddleware implements NestMiddleware {
  constructor(
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = performance.now();
    trace
      .getTracer('fieldpilot-api')
      .startActiveSpan(`${request.method} ${request.path}`, (span) => {
        response.on('finish', () => {
          const route = String(request.route?.path ?? request.path);
          this.metrics.http.observe(
            {
              method: request.method,
              route,
              status: String(response.statusCode),
            },
            (performance.now() - startedAt) / 1_000,
          );
          const area = route.includes('/sync')
            ? 'sync'
            : route.includes('/media')
              ? 'media'
              : route.includes('/daily-reports')
                ? 'reports'
                : route.includes('/notifications/stream')
                  ? 'sse'
                  : undefined;
          if (area)
            this.metrics.domain.inc({
              area,
              outcome: response.statusCode >= 500 ? 'error' : 'request',
            });
          span.setAttributes({
            'http.request.method': request.method,
            'http.response.status_code': response.statusCode,
            'http.route': route,
            'http.duration_ms': performance.now() - startedAt,
          });
          span.end();
        });
        next();
      });
  }
}
