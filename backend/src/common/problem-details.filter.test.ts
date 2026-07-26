import { ArgumentsHost, BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsFilter } from './problem-details.filter';

describe('ProblemDetailsFilter', () => {
  it('logs server errors with request context only once at the boundary', () => {
    const logger = { error: vi.fn() };
    const response = mockResponse();
    const request = {
      method: 'GET',
      originalUrl: '/api/v1/auth/csrf',
      requestId: 'req-1',
    };
    new ProblemDetailsFilter(logger).catch(
      new Error('cookie serializer exploded'),
      mockHost(request, response),
    );

    expect(logger.error).toHaveBeenCalledWith(
      'Unhandled request exception',
      expect.objectContaining({
        method: 'GET',
        path: '/api/v1/auth/csrf',
        requestId: 'req-1',
        status: 500,
      }),
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ detail: 'An unexpected error occurred.' }),
    );
  });

  it('does not log expected client errors', () => {
    const logger = { error: vi.fn() };
    new ProblemDetailsFilter(logger).catch(
      new BadRequestException('bad input'),
      mockHost(
        { method: 'POST', originalUrl: '/api/v1/auth/register' },
        mockResponse(),
      ),
    );

    expect(logger.error).not.toHaveBeenCalled();
  });
});

function mockHost(request: object, response: object) {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ArgumentsHost;
}

function mockResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}
