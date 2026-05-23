import type { FastifyRequest } from 'fastify';
import type { Role } from '@roofops/types';

// AuthContext is the snapshot of "who is making this request" derived from the
// JWT. EVERY service method that touches tenant data must take an AuthContext
// (or be invoked by code that does), and EVERY tenant-scoped query must filter
// on `orgId` from this struct — never from the request body.
export interface AuthContext {
  userId: string;
  orgId: string;
  role: Role;
  requestId: string;
  ip: string;
}

export function authContextFrom(request: FastifyRequest): AuthContext {
  return {
    userId: request.auth.sub,
    orgId: request.auth.orgId,
    role: request.auth.role,
    requestId: request.id,
    ip: request.ip,
  };
}
