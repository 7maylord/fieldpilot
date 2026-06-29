import { Algorithm, hash, verify } from '@node-rs/argon2';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { newId } from '../common/id';
import { loadConfig } from '../config/app.config';
import { PrismaService } from '../database/prisma.service';
import { createToken, hashToken } from './token';

const accessLifetimeMs = 15 * 60 * 1000;
const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly config = loadConfig();

  constructor(private readonly prisma: PrismaService) {}

  async register(emailInput: string, password: string) {
    const email = emailInput.trim().toLowerCase();
    const verificationToken = createToken();
    const userId = newId();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            id: userId,
            email,
            passwordHash: await hash(password, {
              algorithm: Algorithm.Argon2id,
            }),
          },
        });
        await tx.emailVerificationToken.create({
          data: {
            id: newId(),
            userId,
            tokenHash: hashToken(verificationToken),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
        await tx.identityOutboxEvent.create({
          data: {
            id: newId(),
            userId,
            eventType: 'identity.email_verification_requested',
            payload: { email, verificationToken },
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
    return { userId, verificationRequired: true };
  }

  async verifyEmail(token: string) {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date())
      throw new UnauthorizedException('Invalid token');
    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
    ]);
    return { verified: true };
  }

  async login(emailInput: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: emailInput.trim().toLowerCase() },
    });
    if (!user || !(await verify(user.passwordHash, password)))
      throw new UnauthorizedException('Invalid credentials');
    if (!user.emailVerifiedAt)
      throw new UnauthorizedException('Email verification required');
    return this.createSession(user.id);
  }

  async refresh(refreshToken: string) {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(refreshToken) },
    });
    if (
      !session ||
      session.revokedAt ||
      session.refreshExpiresAt <= new Date()
    ) {
      throw new UnauthorizedException('Refresh session expired');
    }
    const tokens = this.sessionTokens();
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        tokenHash: hashToken(tokens.accessToken),
        refreshTokenHash: hashToken(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      },
    });
    return { sessionId: session.id, ...tokens };
  }

  async requestPasswordReset(emailInput: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: emailInput.trim().toLowerCase() },
    });
    if (!user) return { accepted: true };
    const token = createToken();
    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.create({
        data: {
          id: newId(),
          userId: user.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      await tx.identityOutboxEvent.create({
        data: {
          id: newId(),
          userId: user.id,
          eventType: 'identity.password_reset_requested',
          payload: { email: user.email, resetToken: token },
        },
      });
    });
    return { accepted: true };
  }

  async resetPassword(token: string, password: string) {
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date())
      throw new UnauthorizedException('Invalid token');
    const passwordHash = await hash(password, {
      algorithm: Algorithm.Argon2id,
    });
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { reset: true };
  }

  listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, refreshExpiresAt: { gt: new Date() } },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        refreshExpiresAt: true,
      },
    });
  }

  revokeSession(userId: string, sessionId: string) {
    return this.prisma.session.updateMany({
      where: { id: sessionId, userId },
      data: { revokedAt: new Date() },
    });
  }

  private async createSession(userId: string) {
    const tokens = this.sessionTokens();
    const session = await this.prisma.session.create({
      data: {
        id: newId(),
        userId,
        tokenHash: hashToken(tokens.accessToken),
        refreshTokenHash: hashToken(tokens.refreshToken),
        expiresAt: tokens.expiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt,
      },
    });
    return { sessionId: session.id, ...tokens };
  }

  private sessionTokens() {
    return {
      accessToken: createToken(),
      refreshToken: createToken(),
      expiresAt: new Date(Date.now() + accessLifetimeMs),
      refreshExpiresAt: new Date(Date.now() + refreshLifetimeMs),
      secure: this.config.nodeEnv === 'production',
    };
  }
}
