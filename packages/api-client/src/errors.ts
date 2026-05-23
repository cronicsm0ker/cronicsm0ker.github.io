import type { ApiError, ApiErrorCode } from '@roofops/types';

export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly requestId?: string;

  constructor(args: { code: ApiErrorCode; message: string; status: number; details?: unknown; requestId?: string }) {
    super(args.message);
    this.name = 'ApiClientError';
    this.code = args.code;
    this.status = args.status;
    this.details = args.details;
    this.requestId = args.requestId;
  }

  static fromApiError(error: ApiError, status: number): ApiClientError {
    return new ApiClientError({
      code: error.code,
      message: error.message,
      status,
      details: error.details,
      requestId: error.requestId,
    });
  }
}
