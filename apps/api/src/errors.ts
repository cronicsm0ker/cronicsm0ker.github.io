import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import type { ApiError, ApiErrorCode } from '@roofops/types';
import * as Sentry from '@sentry/node';

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(args: { code: ApiErrorCode; message: string; status: number; details?: unknown }) {
    super(args.message);
    this.name = 'AppError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
  }
}

export const Errors = {
  unauthorized: (message = 'Authentication required') =>
    new AppError({ code: 'UNAUTHORIZED', message, status: 401 }),
  forbidden: (message = 'You do not have permission to perform this action') =>
    new AppError({ code: 'FORBIDDEN', message, status: 403 }),
  notFound: (message = 'Resource not found') =>
    new AppError({ code: 'NOT_FOUND', message, status: 404 }),
  conflict: (message: string) => new AppError({ code: 'CONFLICT', message, status: 409 }),
  invalidCredentials: () =>
    new AppError({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password', status: 401 }),
  invalidToken: () =>
    new AppError({ code: 'INVALID_TOKEN', message: 'Token is invalid', status: 401 }),
  expiredToken: () =>
    new AppError({ code: 'EXPIRED_TOKEN', message: 'Token has expired', status: 401 }),
  emailTaken: () =>
    new AppError({ code: 'EMAIL_TAKEN', message: 'Email is already in use', status: 409 }),
  rateLimited: (message = 'Too many requests') =>
    new AppError({ code: 'RATE_LIMITED', message, status: 429 }),
};

export function buildErrorHandler() {
  return function errorHandler(
    err: FastifyError | AppError | ZodError | Error,
    request: FastifyRequest,
    reply: FastifyReply,
  ): FastifyReply {
    const requestId = request.id;

    if (err instanceof ZodError) {
      const payload: ApiError = {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: err.flatten(),
        requestId,
      };
      return reply.status(400).send(payload);
    }

    if (err instanceof AppError) {
      const payload: ApiError = {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      };
      if (err.status >= 500) {
        request.log.error({ err }, 'AppError 5xx');
        Sentry.captureException(err);
      }
      return reply.status(err.status).send(payload);
    }

    const fastifyErr = err as FastifyError;
    if (fastifyErr.statusCode === 400 && fastifyErr.validation) {
      const payload: ApiError = {
        code: 'VALIDATION_ERROR',
        message: fastifyErr.message,
        details: fastifyErr.validation,
        requestId,
      };
      return reply.status(400).send(payload);
    }

    if (typeof fastifyErr.statusCode === 'number' && fastifyErr.statusCode < 500) {
      const payload: ApiError = {
        code: 'VALIDATION_ERROR',
        message: fastifyErr.message,
        requestId,
      };
      return reply.status(fastifyErr.statusCode).send(payload);
    }

    request.log.error({ err }, 'Unhandled error');
    Sentry.captureException(err);
    const payload: ApiError = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      requestId,
    };
    return reply.status(500).send(payload);
  };
}
