import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithId } from './request-id.middleware';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithId>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const detail = typeof body === 'string' ? body : readMessage(body);

    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://fieldpilot.dev/problems/${problemCode(status).toLowerCase().replaceAll('_', '-')}`,
        title: HttpStatus[status] ?? 'Error',
        status,
        code: problemCode(status),
        detail: status === 500 ? 'An unexpected error occurred.' : detail,
        instance: request.originalUrl,
        requestId: request.requestId,
      });
  }
}

function readMessage(body: unknown) {
  if (!body || typeof body !== 'object' || !('message' in body))
    return 'Request failed.';
  const message = body.message;
  return Array.isArray(message) ? message.join('; ') : String(message);
}

function problemCode(status: number) {
  return (
    {
      400: 'VALIDATION_ERROR',
      401: 'AUTHENTICATION_REQUIRED',
      403: 'AUTHORIZATION_DENIED',
      404: 'RESOURCE_NOT_FOUND',
      409: 'RESOURCE_CONFLICT',
      429: 'RATE_LIMITED',
    }[status] ?? 'INTERNAL_ERROR'
  );
}
