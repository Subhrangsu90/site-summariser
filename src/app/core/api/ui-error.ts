import { HttpErrorResponse } from '@angular/common/http';
import type { ApiErrorBody, ErrorCode } from '../../../shared/api.types';

/** An error the UI can explain: the server's codes, plus NETWORK when the server can't be reached. */
export interface UiError {
  code: ErrorCode | 'NETWORK';
  message: string;
}

/** Turns whatever an httpResource failed with into a UiError. */
export function toUiError(error: unknown): UiError | undefined {
  if (!error) return undefined;

  if (error instanceof HttpErrorResponse) {
    const body = error.error as Partial<ApiErrorBody> | null;
    if (body?.error?.code) return { code: body.error.code, message: body.error.message };
    if (error.status === 0) {
      return { code: 'NETWORK', message: "Can't reach the server. Check your connection and try again." };
    }
  }
  return { code: 'INTERNAL', message: 'Something went wrong. Please try again.' };
}
