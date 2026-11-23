import { Component, computed, input, output } from '@angular/core';
import type { UiError } from '../../../../core/api/ui-error';

const TITLES: Record<UiError['code'], string> = {
  INVALID_URL: 'Check the address',
  INVALID_REQUEST: 'Something went wrong',
  BLOCKED_URL: "This address can't be summarised",
  NO_CONTENT: 'Not enough text on this page',
  NOT_SUMMARISABLE: 'No article found',
  FETCH_FAILED: "Couldn't load the page",
  TIMEOUT: 'The site took too long',
  AI_UNAVAILABLE: "The AI couldn't answer",
  PROVIDER_UNAVAILABLE: 'Model not available',
  NETWORK: "Can't reach the server",
  NOT_FOUND: 'Something went wrong',
  INTERNAL: 'Something went wrong',
};

/** Retrying can't fix these: the input itself is the problem. */
const NOT_RETRYABLE = new Set<UiError['code']>([
  'INVALID_URL',
  'INVALID_REQUEST',
  'BLOCKED_URL',
  'NO_CONTENT',
  'NOT_SUMMARISABLE',
]);

@Component({
  selector: 'app-error-state',
  templateUrl: './error-state.html',
})
export class ErrorState {
  readonly error = input.required<UiError>();
  readonly retry = output<void>();

  protected readonly title = computed(() => TITLES[this.error().code]);
  protected readonly canRetry = computed(() => !NOT_RETRYABLE.has(this.error().code));
}
