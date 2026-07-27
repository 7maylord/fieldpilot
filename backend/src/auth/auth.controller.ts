import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { loadConfig } from '../config/app.config';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import {
  LoginDto,
  RegisterDto,
  RequestPasswordResetDto,
  ResetPasswordDto,
  TokenDto,
} from './dto';
import { createToken } from './token';

const authThrottleLimit = Number(
  process.env.AUTH_THROTTLE_LIMIT_PER_MINUTE ?? 5,
);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly secureCookies = loadConfig().nodeEnv === 'production';

  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('csrf')
  csrf(@Res({ passthrough: true }) response: Response) {
    const token = createToken();
    response.cookie('fieldpilot_csrf', token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: this.secureCookies,
      path: '/',
    });
    return { csrfToken: token };
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: authThrottleLimit, ttl: 60_000 } })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body.email, body.password);
  }

  @Public()
  @Post('verify-email')
  verifyEmail(@Body() body: TokenDto) {
    return this.auth.verifyEmail(body.token);
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: authThrottleLimit, ttl: 60_000 } })
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.login(body.email, body.password);
    this.setSessionCookies(response, session);
    return { sessionId: session.sessionId, expiresAt: session.expiresAt };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = await this.auth.refresh(
      String(request.cookies?.fieldpilot_refresh ?? ''),
    );
    this.setSessionCookies(response, session);
    return { sessionId: session.sessionId, expiresAt: session.expiresAt };
  }

  @Public()
  @Post('password-reset/request')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  requestPasswordReset(@Body() body: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(body.email);
  }

  @Public()
  @Post('password-reset/complete')
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body.token, body.password);
  }

  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.revokeSession(user.id, user.sessionId);
    response.clearCookie('fieldpilot_session');
    response.clearCookie('fieldpilot_refresh');
    return { loggedOut: true };
  }

  @Get('sessions')
  sessions(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.listSessions(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return { id: user.id, email: user.email };
  }

  @Delete('sessions/:sessionId')
  async revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    await this.auth.revokeSession(user.id, sessionId);
    return { revoked: true };
  }

  private setSessionCookies(
    response: Response,
    session: {
      accessToken: string;
      refreshToken: string;
      expiresAt: Date;
      refreshExpiresAt: Date;
      secure: boolean;
    },
  ) {
    const base = {
      httpOnly: true,
      secure: session.secure,
      sameSite: 'lax' as const,
    };
    response.cookie('fieldpilot_session', session.accessToken, {
      ...base,
      expires: session.expiresAt,
      path: '/',
    });
    response.cookie('fieldpilot_refresh', session.refreshToken, {
      ...base,
      expires: session.refreshExpiresAt,
      path: '/api/v1/auth/refresh',
    });
  }
}
