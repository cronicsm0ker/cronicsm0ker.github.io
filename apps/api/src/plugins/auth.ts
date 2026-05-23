import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import fastifyJwt from '@fastify/jwt';
import type { JwtAccessPayload, Role } from '@roofops/types';
import { Errors } from '../errors.js';
import { loadEnv } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    requireAuth: preHandlerHookHandler;
    requireRole: (...roles: Role[]) => preHandlerHookHandler;
    signAccessToken: (payload: Record<string, unknown>, options: { expiresIn: number }) => string;
  }
  interface FastifyRequest {
    auth: JwtAccessPayload;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Omit<JwtAccessPayload, 'iat' | 'exp'>;
    user: JwtAccessPayload;
  }
}

export const authPlugin = fp(async function authPlugin(app: FastifyInstance) {
  const env = loadEnv();

  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      algorithm: 'HS256',
    },
  });

  app.decorate(
    'signAccessToken',
    function signAccessToken(payload: Record<string, unknown>, options: { expiresIn: number }) {
      return app.jwt.sign(payload as never, { expiresIn: options.expiresIn });
    },
  );

  const requireAuth: preHandlerHookHandler = async (
    request: FastifyRequest,
    _reply: FastifyReply,
  ) => {
    const header = request.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw Errors.unauthorized();
    }
    try {
      const decoded = await request.jwtVerify<JwtAccessPayload>();
      if (decoded.type !== 'access') {
        throw Errors.invalidToken();
      }
      request.auth = decoded;
    } catch (err) {
      if (err instanceof Error && err.name === 'TokenExpiredError') {
        throw Errors.expiredToken();
      }
      throw Errors.unauthorized();
    }
  };

  app.decorate('requireAuth', requireAuth);

  app.decorate('requireRole', function requireRole(...roles: Role[]): preHandlerHookHandler {
    return async (request: FastifyRequest) => {
      if (!request.auth) {
        throw Errors.unauthorized();
      }
      if (!roles.includes(request.auth.role)) {
        throw Errors.forbidden();
      }
    };
  });
});
