import type { RequestHandler } from 'express';
import { PROVIDER_IDS, type ProvidersResponse } from '../../shared/api.types';
import { checkAvailability, PROVIDERS } from '../ai/providers';
import { config } from '../config';

/** GET /api/providers: which providers the UI toggle should enable. */
export const providersHandler: RequestHandler = async (_req, res) => {
  const providers = await Promise.all(
    PROVIDER_IDS.map(async (id) => {
      const { label, modelName } = PROVIDERS[id];
      return { id, label, model: modelName, ...(await checkAvailability(id)) };
    }),
  );
  const body: ProvidersResponse = { default: config.defaultProvider, providers };
  res.set('cache-control', 'no-store').json(body);
};
