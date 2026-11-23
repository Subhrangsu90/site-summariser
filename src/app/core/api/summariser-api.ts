import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { inject, PLATFORM_ID, Service, type Signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { ApiEndpoint } from '../../../shared/api-endpoints';
import type { ProvidersResponse, SummariseRequest, SummaryResponse } from '../../../shared/api.types';

/** Full URL for an API endpoint, from the environment's base URL and route ('' base = same origin). */
export function apiUrl(endpoint: ApiEndpoint): string {
  return `${environment.apiBaseUrl.replace(/\/+$/, '')}${environment.apiEndpoints[endpoint]}`;
}

/** The client's only way to reach the API. URLs come from src/environments. */
@Service()
export class SummariserApi {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Which AI providers the toggle can offer. Only fetched in the browser:
   * the page is prerendered at build time, when there is no API to call.
   */
  readonly providers = httpResource<ProvidersResponse>(() => (this.isBrowser ? apiUrl('providers') : undefined));

  /**
   * Summarises whatever `request()` holds. A new request cancels the previous
   * one; `undefined` means "nothing submitted yet" and sends nothing.
   * Call it from a field initializer (it needs an injection context).
   */
  summarise(request: Signal<SummariseRequest | undefined>) {
    return httpResource<SummaryResponse>(() => {
      const body = request();
      return body ? { url: apiUrl('summarise'), method: 'POST', body } : undefined;
    });
  }
}
