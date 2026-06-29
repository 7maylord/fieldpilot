import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { tokensEqual } from './token';

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    if (safeMethods.has(request.method)) return true;
    const cookie = request.cookies?.fieldpilot_csrf as string | undefined;
    const header = request.header('x-csrf-token');
    if (!cookie || !header || !tokensEqual(cookie, header))
      throw new ForbiddenException('Invalid CSRF token');
    return true;
  }
}
