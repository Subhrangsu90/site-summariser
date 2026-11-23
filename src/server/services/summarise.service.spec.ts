import { GenkitError } from 'genkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fixed config: no real .env, no network.
vi.mock('../config', () => ({
  config: {
    defaultProvider: 'gemini',
    gemini: { apiKey: 'test-key', model: 'gemini-flash-lite-latest', fallbackModel: 'gemini-3.6-flash' },
    ollama: { server: 'http://127.0.0.1:11434', model: 'gemma4:e2b', numCtx: 8192 },
  },
}));

// The model: each test decides what generate() returns. A plain value or an
// Error (thrown from the wrapper, outside Vitest's mock tracking).
const generate = vi.fn();
vi.mock('../ai/genkit', () => ({
  ai: {
    generate: async (options: unknown) => {
      const result = await generate(options);
      if (result instanceof Error) throw result;
      return result;
    },
  },
}));

vi.mock('./scraper.service', () => ({
  scrapePage: async () => ({
    url: 'https://example.com/a',
    title: 'Example article',
    siteName: 'example.com',
    favicon: null,
    text: 'Some article text. '.repeat(100),
    wordCount: 600,
  }),
}));

const { summarise } = await import('./summarise.service');

const GOOD = { title: 'Headline', tldr: 'Two sentences. Of summary.', keyPoints: ['One.', 'Two.', 'Three.'] };
const overloaded = () =>
  new GenkitError({ status: 'UNAVAILABLE', message: '[503] gemini-flash-lite-latest is experiencing high demand' });

/** The model name each generate() call asked for. */
const modelsCalled = () => generate.mock.calls.map(([options]) => (options as { model: { name: string } }).model.name);

describe('summarise: Gemini fallback model', () => {
  beforeEach(() => generate.mockReset());

  it('uses the main model when it answers', async () => {
    generate.mockReturnValueOnce({ output: GOOD });
    const result = await summarise({ url: 'https://example.com/a', mode: 'tldr', provider: 'gemini' });

    expect(modelsCalled()).toEqual(['googleai/gemini-flash-lite-latest']);
    expect(result.meta.model).toBe('gemini-flash-lite-latest');
    expect(result.summary.readingTimeMin).toBe(3); // 600 words / 200 wpm
  });

  it('retries with the fallback model when the main one is overloaded, and reports which answered', async () => {
    generate.mockReturnValueOnce(overloaded()).mockReturnValueOnce({ output: GOOD });
    const result = await summarise({ url: 'https://example.com/a', mode: 'tldr', provider: 'gemini' });

    expect(modelsCalled()).toEqual(['googleai/gemini-flash-lite-latest', 'googleai/gemini-3.6-flash']);
    expect(result.meta.model).toBe('gemini-3.6-flash');
    expect(result.summary.title).toBe('Headline');
  });

  it('uses the fallback when the main model gives an unusable answer', async () => {
    generate.mockReturnValueOnce({ output: { ...GOOD, keyPoints: [] } }).mockReturnValueOnce({ output: GOOD });
    const result = await summarise({ url: 'https://example.com/a', mode: 'tldr', provider: 'gemini' });
    expect(result.meta.model).toBe('gemini-3.6-flash');
  });

  it('gives the fallback a chance even when the main model name is wrong', async () => {
    generate
      .mockReturnValueOnce(new GenkitError({ status: 'NOT_FOUND', message: 'model not found' }))
      .mockReturnValueOnce({ output: GOOD });
    const result = await summarise({ url: 'https://example.com/a', mode: 'tldr', provider: 'gemini' });
    expect(result.meta.model).toBe('gemini-3.6-flash');
  });

  it('returns AI_UNAVAILABLE when both models fail', async () => {
    generate.mockReturnValue(overloaded());
    await expect(summarise({ url: 'https://example.com/a', mode: 'tldr', provider: 'gemini' })).rejects.toMatchObject({
      code: 'AI_UNAVAILABLE',
    });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('reports NOT_SUMMARISABLE without retrying', async () => {
    generate.mockReturnValueOnce({ output: { title: 'x', tldr: 'NOT_SUMMARISABLE', keyPoints: [] } });
    await expect(summarise({ url: 'https://example.com/a', mode: 'tldr', provider: 'gemini' })).rejects.toMatchObject({
      code: 'NOT_SUMMARISABLE',
    });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
