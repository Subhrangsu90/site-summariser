import type { RequestHandler } from 'express';
import { SummariseRequestSchema, type SummaryResponse } from '../../shared/api.types';
import { summarise } from '../services/summarise.service';
import { ApiError } from '../utils/api-error';

/** POST /api/summarise */
export const summariseHandler: RequestHandler = async (req, res) => {
  const parsed = SummariseRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    throw field === 'url'
      ? new ApiError('INVALID_URL', 'Please enter a web address.')
      : new ApiError('INVALID_REQUEST', `Invalid "${String(field)}". Expected one of the documented values.`);
  }

  // If the client disconnects (e.g. the user submits a new URL), stop fetching and generating.
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort();
  });

  const result: SummaryResponse = await summarise(parsed.data, controller.signal);
  res.json(result);
};
