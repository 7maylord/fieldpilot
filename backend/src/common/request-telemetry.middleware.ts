import { Injectable, type NestMiddleware } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestTelemetryMiddleware implements NestMiddleware {
  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = performance.now();
    trace
      .getTracer('fieldpilot-api')
      .startActiveSpan(`${request.method} ${request.path}`, (span) => {
        response.on('finish', () => {
          span.setAttributes({
            'http.request.method': request.method,
            'http.response.status_code': response.statusCode,
            'http.route': request.route?.path ?? request.path,
            'http.duration_ms': performance.now() - startedAt,
          });
          span.end();
        });
        next();
      });
  }
}
