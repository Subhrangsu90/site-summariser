import { API_ENDPOINTS } from '../shared/api-endpoints';

/**
 * Client (browser) settings for `ng serve` / development builds. Replaces
 * environment.ts through `fileReplacements` in angular.json.
 *
 * Public, like environment.ts: never put secrets here.
 */
export const environment = {
  production: false,
  /** Same origin: `ng serve` runs the API too (through src/server.ts). */
  apiBaseUrl: '',
  apiEndpoints: API_ENDPOINTS,
};
