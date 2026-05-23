import { z } from 'zod';
import { EmailSchema, PasswordSchema, UserSchema } from './user.js';
import { MembershipSchema, OrgSchema } from './org.js';

export const RegisterRequestSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  orgName: z.string().min(1).max(200),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
});
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const LoginResponseSchema = z.object({
  tokens: AuthTokensSchema,
  user: UserSchema,
  memberships: z.array(
    z.object({
      org: OrgSchema,
      membership: MembershipSchema,
    }),
  ),
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const RefreshResponseSchema = z.object({
  tokens: AuthTokensSchema,
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const ForgotPasswordRequestSchema = z.object({
  email: EmailSchema,
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ResetPasswordRequestSchema = z.object({
  token: z.string().min(1),
  password: PasswordSchema,
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const MeResponseSchema = z.object({
  user: UserSchema,
  memberships: z.array(
    z.object({
      org: OrgSchema,
      membership: MembershipSchema,
    }),
  ),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export interface JwtAccessPayload {
  sub: string;
  orgId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  type: 'access';
  iat: number;
  exp: number;
}

// Refresh tokens are opaque random strings (not JWTs), hashed at rest in the
// `refresh_tokens` table so revocation is instant and the bearer token never
// leaks claims if intercepted.
