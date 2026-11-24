import { GenkitError, type z } from 'genkit';
import type { SummariseRequest, SummaryMode, SummaryResponse } from '../../shared/api.types';
import { ai } from '../ai/genkit';
import { checkAvailability, PROVIDERS, type Provider } from '../ai/providers';
import {
  buildChunkPrompt,
  buildUserPrompt,
  CHUNK_SYSTEM_PROMPT,
  MODE_RULES,
  SYSTEM_PROMPT,
} from '../ai/summary.prompt';
import {
  ChunkNotesSchema,
  ModelSummarySchema,
  NOT_SUMMARISABLE,
  type ChunkNotes,
  type ModelSummary,
} from '../ai/summary.schema';
import { config } from '../config';
import { ApiError } from '../utils/api-error';
import { splitIntoChunks } from '../utils/truncate';
import { scrapePage } from './scraper.service';

const WORDS_PER_MINUTE = 200;
/** A model call with less time than this would almost certainly time out, so it is skipped. */
const MIN_ATTEMPT_MS = 3_000;
/** Most notes kept per part of a long page. */
const MAX_NOTES_PER_PART = 8;
/** Genkit statuses that mean "this provider isn't set up", which a retry won't fix. */
const SETUP_ERRORS = new Set([
  'FAILED_PRECONDITION',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
]);

/**
 * The whole pipeline: check provider → fetch + extract → (long page: notes per
 * part) → summary → response. Everything runs against one deadline per request.
 */
export async function summarise(
  request: SummariseRequest,
  signal?: AbortSignal,
): Promise<SummaryResponse> {
  const startedAt = Date.now();
  const provider = PROVIDERS[request.provider ?? config.defaultProvider];
  const deadline = startedAt + provider.requestBudgetMs;

  // Fail fast, before spending up to 10 s fetching the page.
  const availability = await checkAvailability(provider.id);
  if (!availability.available) {
    throw new ApiError(
      'PROVIDER_UNAVAILABLE',
      `${provider.label} is not available. ${availability.reason ?? ''}`.trim(),
    );
  }

  const page = await scrapePage(request.url, signal);
  const { chunks, truncated } = splitIntoChunks(page.text, provider.maxChars, provider.maxChunks);

  // Long page: summarise each part into notes (map), then summarise the notes (reduce).
  const { input, skippedParts } =
    chunks.length > 1
      ? await takeNotes(provider, page.title, chunks, deadline, signal)
      : { input: chunks[0] ?? '', skippedParts: 0 };

  const { value: summary, modelName } = await generateChecked({
    provider,
    system: SYSTEM_PROMPT,
    buildPrompt: (isRetry) => buildUserPrompt(request.mode, page.title, input, isRetry, chunks.length),
    schema: ModelSummarySchema,
    check: (output) => checkSummary(output as ModelSummary | null, request.mode),
    deadline,
    signal,
  });

  return {
    source: { url: page.url, siteName: page.siteName, title: page.title, favicon: page.favicon },
    summary: {
      ...summary,
      // From the whole extracted text, not just the part the model saw.
      readingTimeMin: Math.max(1, Math.round(page.wordCount / WORDS_PER_MINUTE)),
    },
    meta: {
      provider: provider.id,
      model: modelName, // the model that actually answered (may be the fallback)
      // Some of the page is missing: past the parts limit, or a part that failed.
      truncated: truncated || skippedParts > 0,
      chunks: chunks.length,
      ms: Date.now() - startedAt,
    },
  };
}

/**
 * Map step: notes for each part, in parallel for cloud models and one by one
 * for a local one. A part that fails is skipped; only if every part fails does
 * the request fail. Time is held back for the final summary.
 */
async function takeNotes(
  provider: Provider,
  title: string,
  chunks: string[],
  deadline: number,
  signal: AbortSignal | undefined,
): Promise<{ input: string; skippedParts: number }> {
  const parts = chunks.length;
  const notesDeadline = deadline - provider.timeoutMs; // keep one full attempt for the summary

  const notesFor = async (chunk: string, index: number): Promise<string[]> => {
    const { value } = await generateChecked({
      provider,
      system: CHUNK_SYSTEM_PROMPT,
      buildPrompt: (isRetry) => buildChunkPrompt(title, chunk, index + 1, parts, isRetry),
      schema: ChunkNotesSchema,
      check: (output) => checkNotes(output as ChunkNotes | null),
      deadline: notesDeadline,
      signal,
    });
    return value;
  };

  let results: PromiseSettledResult<string[]>[];
  if (provider.parallelChunks) {
    results = await Promise.allSettled(chunks.map(notesFor));
  } else {
    results = [];
    for (const [index, chunk] of chunks.entries()) {
      results.push(await notesFor(chunk, index).then(fulfilled, rejected));
    }
  }
  if (signal?.aborted) throw signal.reason;

  const sections = results.flatMap((result, index) =>
    result.status === 'fulfilled' && result.value.length
      ? [`Part ${index + 1} of ${parts}:\n${result.value.map((note) => `- ${note}`).join('\n')}`]
      : [],
  );
  if (sections.length) {
    const skippedParts = results.filter((r) => r.status === 'rejected').length;
    return { input: sections.join('\n\n'), skippedParts };
  }

  // Every part failed. A clear reason (e.g. the provider isn't set up) wins over a generic one.
  const reason = results.find((r): r is PromiseRejectedResult => r.status === 'rejected')?.reason;
  if (reason instanceof ApiError && reason.code !== 'NOT_SUMMARISABLE') throw reason;
  throw new ApiError('NOT_SUMMARISABLE', "Couldn't find an article on this page.", { cause: reason });
}

const fulfilled = <T>(value: T): PromiseSettledResult<T> => ({ status: 'fulfilled', value });
const rejected = (reason: unknown): PromiseRejectedResult => ({ status: 'rejected', reason });

interface GenerateOptions<T> {
  provider: Provider;
  system: string;
  buildPrompt: (isRetry: boolean) => string;
  schema: z.ZodTypeAny;
  /** Turns the model's output into a value, NOT_SUMMARISABLE, or null for "unusable: retry". */
  check: (output: unknown) => T | typeof NOT_SUMMARISABLE | null;
  /** No attempt starts or runs past this time. */
  deadline: number;
  signal?: AbortSignal;
}

/**
 * Calls the model, checks the answer, and retries once with a stricter prompt.
 * The retry uses the provider's fallback model when it has one, so an
 * overloaded model (Gemini's 503 "high demand") isn't simply asked again.
 * Both attempts share 2× the provider's timeout, capped by the deadline.
 */
async function generateChecked<T>(options: GenerateOptions<T>): Promise<{ value: T; modelName: string }> {
  const { provider, signal } = options;
  const budgetEnd = Math.min(Date.now() + provider.timeoutMs * 2, options.deadline);
  let lastProblem: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const remaining = budgetEnd - Date.now();
    const attemptMs = attempt === 1 ? Math.min(provider.timeoutMs, remaining) : remaining;
    if (attemptMs < MIN_ATTEMPT_MS) break; // not enough time left for a useful call

    const target = attempt > 1 && provider.fallback ? provider.fallback : provider;
    if (target !== provider) {
      console.warn(
        `[ai] ${provider.modelName} failed; retrying with ${target.modelName} (${Math.round(attemptMs / 1000)} s left)`,
      );
    }

    const timeout = AbortSignal.timeout(attemptMs);
    let output: unknown;
    try {
      const response = await ai.generate({
        model: target.model,
        system: options.system,
        prompt: options.buildPrompt(attempt > 1),
        output: { schema: options.schema },
        config: provider.modelConfig,
        abortSignal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      output = response.output;
    } catch (err) {
      if (signal?.aborted) throw err; // the client cancelled
      const fallbackLeft = attempt === 1 && provider.fallback !== undefined;
      if (timeout.aborted) {
        // A hung model gets one try of the fallback model. Without a fallback it isn't
        // retried: waiting the same time again for the same model would be worse for the user.
        if (fallbackLeft) {
          lastProblem = err;
          continue;
        }
        throw new ApiError('AI_UNAVAILABLE', 'The AI model took too long to respond. Please try again.', {
          cause: err,
        });
      }
      // A setup error (e.g. a retired model name) still lets the fallback model try first.
      if (err instanceof GenkitError && SETUP_ERRORS.has(err.status) && !fallbackLeft) {
        throw new ApiError('PROVIDER_UNAVAILABLE', `${provider.label} is not set up correctly.`, {
          cause: err,
        });
      }
      lastProblem = err; // model error, rate limit, or output that failed the schema
      continue;
    }

    const checked = options.check(output);
    if (checked === NOT_SUMMARISABLE) {
      throw new ApiError('NOT_SUMMARISABLE', "Couldn't find an article on this page.");
    }
    if (checked !== null) return { value: checked, modelName: target.modelName };
    lastProblem = new Error(`Unusable model output: ${JSON.stringify(output)?.slice(0, 300)}`);
  }

  if (lastProblem === undefined) {
    throw new ApiError('AI_UNAVAILABLE', 'The AI model took too long to respond. Please try again.');
  }
  throw new ApiError(
    'AI_UNAVAILABLE',
    `${provider.label} is busy or gave an unusable answer. Try again in a moment, or switch to the other AI model.`,
    { cause: lastProblem },
  );
}

/** Checks the schema can't express: non-empty fields and the number of key points. */
function checkSummary(
  output: ModelSummary | null,
  mode: SummaryMode,
): ModelSummary | typeof NOT_SUMMARISABLE | null {
  if (!output) return null;
  const tldr = output.tldr.trim();
  if (tldr === NOT_SUMMARISABLE) return NOT_SUMMARISABLE;

  const rules = MODE_RULES[mode];
  const keyPoints = output.keyPoints.map((point) => point.trim()).filter(Boolean);
  if (!tldr || keyPoints.length < rules.minPoints) return null;

  return {
    title: output.title.trim() || 'Summary',
    tldr,
    keyPoints: keyPoints.slice(0, rules.maxPoints),
  };
}

/** Notes for one part. An empty list is a valid answer (a part with nothing worth keeping). */
function checkNotes(output: ChunkNotes | null): string[] | null {
  if (!output || !Array.isArray(output.keyPoints)) return null;
  return output.keyPoints
    .map((note) => note.trim())
    .filter(Boolean)
    .slice(0, MAX_NOTES_PER_PART);
}
