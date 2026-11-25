import { HttpErrorResponse } from '@angular/common/http';
import { $ZodError } from 'zod/v4/core';
import { ApiErrorBodySchema, type ErrorCode } from '../../../shared/api.types';

export interface UiError {
  code: ErrorCode | 'NETWORK';
  message: string;
}

export function toUiError(error: unknown): UiError | undefined {
  if (!error) return undefined;

  if (error instanceof HttpErrorResponse) {
    const body = ApiErrorBodySchema.safeParse(error.error);
    if (body.success) return body.data.error;
    if (error.status === 0) {
      return { code: 'NETWORK', message: "Can't reach the server. Check your connection and try again." };
    }
  }
  if (error instanceof $ZodError) {
    return { code: 'INTERNAL', message: 'The server sent an unexpected answer. Please try again.' };
  }
  return { code: 'INTERNAL', message: 'Something went wrong. Please try again.' };
}
