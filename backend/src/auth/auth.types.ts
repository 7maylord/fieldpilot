import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  sessionId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
