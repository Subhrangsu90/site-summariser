import type { ErrorRequestHandler } from 'express';
import type { ApiErrorBody, ErrorCode } from '../../shared/api.types';

const HTTP_STATUS: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_URL: 400,
  BLOCKED_URL: 403,
  NOT_FOUND: 404,
  NO_CONTENT: 422,
  NOT_SUMMARISABLE: 422,
  INTERNAL: 500,
  FETCH_FAILED: 502,
  AI_UNAVAILABLE: 503,
  PROVIDER_UNAVAILABLE: 503,
  TIMEOUT: 504,
};

/** An expected failure with a code the UI knows how to explain. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;

  constructor(code: ErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ApiError';
    this.code = code;
    this.status = HTTP_STATUS[code];
  }
}

function send(res: Parameters<ErrorRequestHandler>[2], status: number, code: ErrorCode, message: string) {
  const body: ApiErrorBody = { error: { code, message } };
  res.status(status).json(body);
}

/** Turns any error thrown in an /api route into `{ error: { code, message } }`. */
export const apiErrorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) return next(err);
  // The client went away (e.g. it submitted a new URL), so nobody is listening.
  if (res.destroyed) return;

  if (err instanceof ApiError) {
    const cause = err.cause instanceof Error ? ` (cause: ${err.cause.message})` : '';
    console.warn(`[api] ${err.code}: ${err.message}${cause}`);
    return send(res, err.status, err.code, err.message);
  }

  // Errors from express.json()
  if (err?.type === 'entity.parse.failed') {
    return send(res, 400, 'INVALID_REQUEST', 'The request body must be valid JSON.');
  }
  if (err?.type === 'entity.too.large') {
    return send(res, 413, 'INVALID_REQUEST', 'The request body is too large.');
  }

  console.error('[api] unexpected error', err);
  return send(res, 500, 'INTERNAL', 'Something went wrong on our side. Please try again.');
};
