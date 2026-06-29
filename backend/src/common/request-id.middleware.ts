import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { newId } from './id';

export interface RequestWithId extends Request {
  requestId: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: RequestWithId, response: Response, next: NextFunction) {
    const supplied = request.header('x-request-id');
    request.requestId =
      supplied && /^[\w.-]{1,128}$/.test(supplied) ? supplied : newId();
    response.setHeader('x-request-id', request.requestId);
    next();
  }
}
