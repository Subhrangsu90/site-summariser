import { API_ENDPOINTS } from '../shared/api-endpoints';

/**
 * Client (browser) settings for production builds.
 *
 * Everything here is bundled into the JavaScript the browser downloads, so it
 * is public. Never put secrets here: API keys belong in the server's .env.
 */
export const environment = {
  production: true,
  /**
   * Where the API lives. '' means same origin: the API runs inside the Angular
   * SSR server, so the browser calls /api/... with no CORS. Set a full URL only
   * if the API is ever hosted separately (that server would then need CORS).
   */
  apiBaseUrl: '',
  apiEndpoints: API_ENDPOINTS,
};
