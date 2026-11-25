import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { inject, PLATFORM_ID, Service, type Signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { ApiEndpoint } from '../../../shared/api-endpoints';
import {
  ProvidersResponseSchema,
  SummaryResponseSchema,
  type SummariseRequest,
} from '../../../shared/api.types';

export function apiUrl(endpoint: ApiEndpoint): string {
  return `${environment.apiBaseUrl.replace(/\/+$/, '')}${environment.apiEndpoints[endpoint]}`;
}

@Service()
export class SummariserApi {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Which AI providers the toggle can offer. Only fetched in the browser:
   * the page is prerendered at build time, when there is no API to call.
   */
  readonly providers = httpResource(() => (this.isBrowser ? apiUrl('providers') : undefined), {
    parse: (raw) => ProvidersResponseSchema.parse(raw),
  });

  /** Must be called from a field initializer: httpResource needs an injection context. */
  summarise(request: Signal<SummariseRequest | undefined>) {
    return httpResource(
      () => {
        const body = request();
        return body ? { url: apiUrl('summarise'), method: 'POST', body } : undefined;
      },
      { parse: (raw) => SummaryResponseSchema.parse(raw) },
    );
  }
}
