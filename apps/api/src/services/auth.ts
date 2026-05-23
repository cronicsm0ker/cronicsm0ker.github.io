import argon2 from 'argon2';
import type { PrismaClient } from '@roofops/db';
import { Role } from '@roofops/db';
import type {
  AuthTokens,
  LoginResponse,
  MeResponse,
  Role as RoleType,
} from '@roofops/types';
import { Errors } from '../errors.js';
import { generateOpaqueToken, hashToken } from '../lib/tokens.js';
import type { Env } from '../env.js';
import type { EmailProvider } from './email.js';
import type { Logger } from '../logger.js';

interface SignAccessTokenFn {
  (payload: Record<string, unknown>, options: { expiresIn: number }): string;
}

interface AuthServiceDeps {
  prisma: PrismaClient;
  env: Env;
  signAccessToken: SignAccessTokenFn;
  email: EmailProvider;
  logger: Logger;
}

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  async register(input: { email: string; password: string; orgName: string }): Promise<LoginResponse> {
    const { prisma } = this.deps;
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw Errors.emailTaken();
    }
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: input.email, passwordHash },
      });
      const org = await tx.org.create({
        data: { name: input.orgName },
      });
      const membership = await tx.membership.create({
        data: { userId: user.id, orgId: org.id, role: Role.OWNER },
      });
      return { user, org, membership };
    });

    const tokens = await this.issueTokens({
      userId: result.user.id,
      orgId: result.org.id,
      role: result.membership.role,
    });

    return {
      tokens,
      user: this.serializeUser(result.user),
      memberships: [
        {
          org: this.serializeOrg(result.org),
          membership: this.serializeMembership(result.membership),
        },
      ],
    };
  }

  async login(input: { email: string; password: string }): Promise<LoginResponse> {
    const { prisma } = this.deps;
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: {
        memberships: { include: { org: true } },
      },
    });
    if (!user) {
      throw Errors.invalidCredentials();
    }
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw Errors.invalidCredentials();
    }
    if (user.memberships.length === 0) {
      throw Errors.forbidden('User has no org membership');
    }
    const active = user.memberships[0]!;
    const tokens = await this.issueTokens({
      userId: user.id,
      orgId: active.orgId,
      role: active.role,
    });
    return {
      tokens,
      user: this.serializeUser(user),
      memberships: user.memberships.map((m) => ({
        org: this.serializeOrg(m.org),
        membership: this.serializeMembership(m),
      })),
    };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const { prisma } = this.deps;
    const tokenHash = hashToken(refreshToken);
    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: { memberships: true },
        },
      },
    });
    if (!record || record.revokedAt || record.expiresAt < new Date()) {
      throw Errors.invalidToken();
    }

    const active = record.user.memberships[0];
    if (!active) {
      throw Errors.forbidden('User has no org membership');
    }

    // Rotate: revoke old, issue new.
    await prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens({
      userId: record.userId,
      orgId: active.orgId,
      role: active.role,
    });
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const { prisma } = this.deps;
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken
      .update({
        where: { tokenHash },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }

  async forgotPassword(email: string): Promise<void> {
    const { prisma, env, email: emailProvider, logger } = this.deps;
    const user = await prisma.user.findUnique({ where: { email } });
    // Always succeed publicly to avoid user enumeration.
    if (!user) {
      logger.info({ email }, 'forgot-password requested for unknown email');
      return;
    }
    const token = generateOpaqueToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + env.PASSWORD_RESET_TTL_SECONDS * 1000);
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });
    const resetUrl = `${env.APP_WEB_URL}/reset/${token}`;
    await emailProvider.send({
      to: user.email,
      subject: 'Reset your RoofOps password',
      text: `Click to reset your password: ${resetUrl}\nLink expires in ${
        env.PASSWORD_RESET_TTL_SECONDS / 60
      } minutes.`,
    });
  }

  async resetPassword(input: { token: string; password: string }): Promise<void> {
    const { prisma } = this.deps;
    const tokenHash = hashToken(input.token);
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw Errors.invalidToken();
    }
    const passwordHash = await argon2.hash(input.password, ARGON2_OPTIONS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Revoke all outstanding refresh tokens on password reset.
      prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async me(userId: string): Promise<MeResponse> {
    const { prisma } = this.deps;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: { include: { org: true } },
      },
    });
    if (!user) {
      throw Errors.unauthorized();
    }
    return {
      user: this.serializeUser(user),
      memberships: user.memberships.map((m) => ({
        org: this.serializeOrg(m.org),
        membership: this.serializeMembership(m),
      })),
    };
  }

  private async issueTokens(input: { userId: string; orgId: string; role: RoleType }): Promise<AuthTokens> {
    const { env, prisma, signAccessToken } = this.deps;
    const accessToken = signAccessToken(
      { sub: input.userId, orgId: input.orgId, role: input.role, type: 'access' },
      { expiresIn: env.JWT_ACCESS_TTL_SECONDS },
    );
    const refreshTokenRaw = generateOpaqueToken();
    const refreshTokenHash = hashToken(refreshTokenRaw);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_TTL_SECONDS * 1000);
    await prisma.refreshToken.create({
      data: { userId: input.userId, tokenHash: refreshTokenHash, expiresAt },
    });
    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: env.JWT_ACCESS_TTL_SECONDS,
    };
  }

  private serializeUser(user: { id: string; email: string; createdAt: Date }) {
    return { id: user.id, email: user.email, createdAt: user.createdAt.toISOString() };
  }

  private serializeOrg(org: { id: string; name: string; createdAt: Date }) {
    return { id: org.id, name: org.name, createdAt: org.createdAt.toISOString() };
  }

  private serializeMembership(membership: {
    userId: string;
    orgId: string;
    role: RoleType;
    createdAt: Date;
  }) {
    return {
      userId: membership.userId,
      orgId: membership.orgId,
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
    };
  }
}
