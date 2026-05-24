// Shared helpers for inbound channel adapters.

import type { FastifyRequest } from 'fastify';
import type { AuthContext } from '../lib/auth-context.js';

interface CredentialLike {
  orgId: string;
}

// Channel adapters operate on behalf of the org, not a user. We synthesize
// an AuthContext with a sentinel actor id so audit-log entries are
// attributable to "the system" rather than to a real user.
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export function authContextFromCredential(
  credential: CredentialLike,
  request: FastifyRequest,
): AuthContext {
  return {
    userId: SYSTEM_ACTOR_ID,
    orgId: credential.orgId,
    role: 'MEMBER',
    requestId: request.id,
    ip: request.ip,
  };
}
