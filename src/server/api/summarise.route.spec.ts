import express from 'express';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../utils/api-error';

// The route's job is HTTP: validation, status codes, the error shape. The pipeline
// itself is tested in summarise.service.spec.ts.
// A plain function, not vi.fn: Vitest's mock tracking made an extra call with no
// arguments here and reported handled rejections as failures.
let summariseImpl: (...args: unknown[]) => Promise<unknown> = async () => undefined;
const summariseCalls: unknown[][] = [];
vi.mock('../services/summarise.service', () => ({
  summarise: (...args: unknown[]) => {
    summariseCalls.push(args);
    return summariseImpl(...args);
  },
}));
vi.mock('./providers.route', () => ({ providersHandler: () => undefined }));

const { createApiRouter } = await import('./api.router');

const RESULT = {
  source: { url: 'https://example.com/a', siteName: 'example.com', title: 'A', favicon: null },
  summary: { title: 'Headline', tldr: 'Short.', keyPoints: ['One.'], readingTimeMin: 1 },
  meta: { provider: 'gemini', model: 'gemini-flash-lite-latest', truncated: false, chunks: 1, ms: 10 },
};

let baseUrl = '';
let server: ReturnType<ReturnType<typeof express>['listen']>;

beforeAll(async () => {
  const app = express();
  app.use('/api', createApiRouter());
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  summariseCalls.length = 0;
  summariseImpl = async () => undefined;
});

function post(path: string, body: unknown) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/summarise', () => {
  it('answers with the summary as JSON, passing the validated request on', async () => {
    summariseImpl = async () => RESULT;
    const res = await post('/api/summarise', { url: ' https://example.com/a ', mode: 'bullets', provider: 'ollama' });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(RESULT);
    expect(summariseCalls[0]?.[0]).toEqual({ url: 'https://example.com/a', mode: 'bullets', provider: 'ollama' });
  });

  it('defaults the mode to tldr', async () => {
    summariseImpl = async () => RESULT;
    await post('/api/summarise', { url: 'https://example.com/a' });
    expect(summariseCalls[0]?.[0]).toMatchObject({ mode: 'tldr' });
  });

  it('turns pipeline failures into the error shape with the right status', async () => {
    summariseImpl = async () => {
      throw new ApiError('TIMEOUT', 'The site took too long to respond.');
    };
    const res = await post('/api/summarise', { url: 'https://slow.example', mode: 'tldr' });

    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: { code: 'TIMEOUT', message: 'The site took too long to respond.' } });
  });

  it('rejects a missing URL or an unknown mode before doing any work', async () => {
    const noUrl = await post('/api/summarise', { mode: 'tldr' });
    expect(noUrl.status).toBe(400);
    expect(await noUrl.json()).toEqual({ error: { code: 'INVALID_URL', message: 'Please enter a web address.' } });

    const badMode = await post('/api/summarise', { url: 'https://example.com', mode: 'poem' });
    expect(badMode.status).toBe(400);
    expect((await badMode.json()).error.code).toBe('INVALID_REQUEST');

    expect(summariseCalls).toHaveLength(0);
  });

  it('answers unknown API routes with NOT_FOUND', async () => {
    const res = await fetch(`${baseUrl}/api/nope`, { method: 'POST' });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });
});
