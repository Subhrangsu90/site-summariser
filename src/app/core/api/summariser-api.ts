import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { inject, PLATFORM_ID, Service, type Signal } from '@angular/core';
import type { ProvidersResponse, SummariseRequest, SummaryResponse } from '../../../shared/api.types';

/** The one place that knows the API's URLs. */
@Service()
export class SummariserApi {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /**
   * Which AI providers the toggle can offer. Only fetched in the browser:
   * the page is prerendered at build time, when there is no API to call.
   */
  readonly providers = httpResource<ProvidersResponse>(() => (this.isBrowser ? '/api/providers' : undefined));

  /**
   * Summarises whatever `request()` holds. A new request cancels the previous
   * one; `undefined` means "nothing submitted yet" and sends nothing.
   * Call it from a field initializer (it needs an injection context).
   */
  summarise(request: Signal<SummariseRequest | undefined>) {
    return httpResource<SummaryResponse>(() => {
      const body = request();
      return body ? { url: '/api/summarise', method: 'POST', body } : undefined;
    });
  }
}
