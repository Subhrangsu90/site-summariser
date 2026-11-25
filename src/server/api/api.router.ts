import { json, Router } from 'express';
import { API_ENDPOINTS, API_PREFIX, type ApiEndpoint } from '../../shared/api-endpoints';
import { ApiError, apiErrorHandler } from '../utils/api-error';
import { providersHandler } from './providers.route';
import { summariseHandler } from './summarise.route';

/** The router is mounted at API_PREFIX, so each route is the endpoint path without it ("/api/health" → "/health"). */
function route(endpoint: ApiEndpoint): string {
  return API_ENDPOINTS[endpoint].slice(API_PREFIX.length);
}

/** Express 5 forwards errors thrown in async handlers to apiErrorHandler. */
export function createApiRouter(): Router {
  const router = Router();
  router.use(json({ limit: '10kb' }));

  router.get(route('health'), (_req, res) => {
    res.json({ ok: true });
  });
  router.get(route('providers'), providersHandler);
  router.post(route('summarise'), summariseHandler);

  router.use(() => {
    throw new ApiError('NOT_FOUND', 'Unknown API route.');
  });
  router.use(apiErrorHandler);
  return router;
}
