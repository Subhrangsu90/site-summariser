/**
 * The API's routes, defined once and used by both the Express router
 * (src/server/api/api.router.ts) and the Angular client (via src/environments),
 * so the two can't drift apart. Plain strings only: this file is bundled into the browser.
 */
export const API_PREFIX = '/api';

export const API_ENDPOINTS = {
  health: `${API_PREFIX}/health`,
  providers: `${API_PREFIX}/providers`,
  summarise: `${API_PREFIX}/summarise`,
} as const;

export type ApiEndpoint = keyof typeof API_ENDPOINTS;
