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

// The model. Each test decides what a call returns: a plain value, or an Error
// (thrown from the wrapper, outside Vitest's mock tracking).
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

const SHORT_PAGE = {
  url: 'https://example.com/a',
  title: 'Example article',
  siteName: 'example.com',
  favicon: null,
  text: 'Some article text. '.repeat(100), // ~1,900 chars: one part
  wordCount: 600,
};
const scrapePage = vi.fn(async () => SHORT_PAGE);
vi.mock('./scraper.service', () => ({ scrapePage: () => scrapePage() }));

const { summarise } = await import('./summarise.service');

const GOOD = { title: 'Headline', tldr: 'Two sentences. Of summary.', keyPoints: ['One.', 'Two.', 'Three.'] };
const overloaded = () =>
  new GenkitError({ status: 'UNAVAILABLE', message: '[503] gemini-flash-lite-latest is experiencing high demand' });

type Call = { model: { name: string }; system: string; prompt: string };
const calls = () => generate.mock.calls.map(([options]) => options as Call);
const modelsCalled = () => calls().map((c) => c.model.name);
const request = { url: 'https://example.com/a', mode: 'tldr', provider: 'gemini' } as const;

beforeEach(() => {
  generate.mockReset();
  scrapePage.mockReset().mockResolvedValue(SHORT_PAGE);
});

describe('summarise: Gemini fallback model', () => {
  it('uses the main model when it answers', async () => {
    generate.mockReturnValueOnce({ output: GOOD });
    const result = await summarise(request);

    expect(modelsCalled()).toEqual(['googleai/gemini-flash-lite-latest']);
    expect(result.meta).toMatchObject({ model: 'gemini-flash-lite-latest', chunks: 1, truncated: false });
    expect(result.summary.readingTimeMin).toBe(3); // 600 words / 200 wpm
  });

  it('retries with the fallback model when the main one is overloaded, and reports which answered', async () => {
    generate.mockReturnValueOnce(overloaded()).mockReturnValueOnce({ output: GOOD });
    const result = await summarise(request);

    expect(modelsCalled()).toEqual(['googleai/gemini-flash-lite-latest', 'googleai/gemini-3.6-flash']);
    expect(result.meta.model).toBe('gemini-3.6-flash');
    expect(result.summary.title).toBe('Headline');
  });

  it('uses the fallback when the main model gives an unusable answer', async () => {
    generate.mockReturnValueOnce({ output: { ...GOOD, keyPoints: [] } }).mockReturnValueOnce({ output: GOOD });
    expect((await summarise(request)).meta.model).toBe('gemini-3.6-flash');
  });

  it('gives the fallback a chance even when the main model name is wrong', async () => {
    generate
      .mockReturnValueOnce(new GenkitError({ status: 'NOT_FOUND', message: 'model not found' }))
      .mockReturnValueOnce({ output: GOOD });
    expect((await summarise(request)).meta.model).toBe('gemini-3.6-flash');
  });

  it('returns AI_UNAVAILABLE when both models fail', async () => {
    generate.mockReturnValue(overloaded());
    await expect(summarise(request)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('reports NOT_SUMMARISABLE without retrying', async () => {
    generate.mockReturnValueOnce({ output: { title: 'x', tldr: 'NOT_SUMMARISABLE', keyPoints: [] } });
    await expect(summarise(request)).rejects.toMatchObject({ code: 'NOT_SUMMARISABLE' });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('summarise: long pages (map-reduce)', () => {
  // ~30,000 chars: three 12,000-char parts for Gemini.
  const LONG_PAGE = { ...SHORT_PAGE, text: 'A fact about lighthouses. '.repeat(1150), wordCount: 4600 };

  /** Notes for part calls, the final summary for the last call. */
  function answerNotesThenSummary(notes: (string[] | Error)[] = [['Note A'], ['Note B'], ['Note C']]) {
    generate.mockImplementation(async (options: Call) => {
      if (options.system.includes('take notes')) {
        const part = Number(/part (\d) of/.exec(options.prompt)?.[1]) - 1;
        const answer = notes[part];
        return answer instanceof Error ? answer : { output: { keyPoints: answer } };
      }
      return { output: GOOD };
    });
  }

  it('takes notes per part, then summarises the notes', async () => {
    scrapePage.mockResolvedValue(LONG_PAGE);
    answerNotesThenSummary();
    const result = await summarise(request);

    const noteCalls = calls().filter((c) => c.system.includes('take notes'));
    expect(noteCalls).toHaveLength(3);
    const final = calls().find((c) => !c.system.includes('take notes'))!;
    expect(final.prompt).toContain('notes taken from the 3 parts');
    expect(final.prompt).toContain('Part 1 of 3:\n- Note A');
    expect(final.prompt).toContain('Part 3 of 3:\n- Note C');
    expect(result.meta).toMatchObject({ chunks: 3, truncated: false });
    expect(result.summary.readingTimeMin).toBe(23); // from the whole page
  });

  it('skips a part that fails and marks the summary as not covering everything', async () => {
    scrapePage.mockResolvedValue(LONG_PAGE);
    // Part 2 fails on the main model and on the fallback.
    answerNotesThenSummary([['Note A'], overloaded(), ['Note C']]);
    const result = await summarise(request);

    const final = calls().find((c) => !c.system.includes('take notes'))!;
    expect(final.prompt).not.toContain('Part 2 of 3');
    expect(result.meta).toMatchObject({ chunks: 3, truncated: true });
  });

});
