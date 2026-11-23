import { json, Router } from 'express';
import { ApiError, apiErrorHandler } from '../utils/api-error';
import { providersHandler } from './providers.route';
import { summariseHandler } from './summarise.route';

/** Everything under /api. Express 5 forwards errors thrown in async handlers to apiErrorHandler. */
export function createApiRouter(): Router {
  const router = Router();
  router.use(json({ limit: '10kb' }));

  router.get('/health', (_req, res) => {
    res.json({ ok: true });
  });
  router.get('/providers', providersHandler);
  router.post('/summarise', summariseHandler);

  router.use(() => {
    throw new ApiError('NOT_FOUND', 'Unknown API route.');
  });
  router.use(apiErrorHandler);
  return router;
}
