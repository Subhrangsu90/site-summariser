import { GenkitError } from 'genkit';
import type { SummariseRequest, SummaryMode, SummaryResponse } from '../../shared/api.types';
import { ai } from '../ai/genkit';
import { checkAvailability, PROVIDERS, type Provider } from '../ai/providers';
import { buildUserPrompt, MODE_RULES, SYSTEM_PROMPT } from '../ai/summary.prompt';
import { ModelSummarySchema, NOT_SUMMARISABLE, type ModelSummary } from '../ai/summary.schema';
import { config } from '../config';
import { ApiError } from '../utils/api-error';
import { truncate } from '../utils/truncate';
import { scrapePage } from './scraper.service';

const WORDS_PER_MINUTE = 200;
/** A retry with less time than this would almost certainly time out, so it is skipped. */
const MIN_ATTEMPT_MS = 3_000;
/** Genkit statuses that mean "this provider isn't set up", which a retry won't fix. */
const SETUP_ERRORS = new Set([
  'FAILED_PRECONDITION',
  'NOT_FOUND',
  'UNAUTHENTICATED',
  'PERMISSION_DENIED',
]);

/** The whole pipeline: check provider → fetch + extract → truncate → AI → response. */
export async function summarise(
  request: SummariseRequest,
  signal?: AbortSignal,
): Promise<SummaryResponse> {
  const startedAt = performance.now();
  const provider = PROVIDERS[request.provider ?? config.defaultProvider];

  // Fail fast, before spending up to 10 s fetching the page.
  const availability = await checkAvailability(provider.id);
  if (!availability.available) {
    throw new ApiError(
      'PROVIDER_UNAVAILABLE',
      `${provider.label} is not available. ${availability.reason ?? ''}`.trim(),
    );
  }

  const page = await scrapePage(request.url, signal);
  const { text, truncated } = truncate(page.text, provider.maxChars);
  const { summary, modelName } = await generateSummary(
    provider,
    request.mode,
    page.title,
    text,
    signal,
  );

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
      truncated,
      ms: Math.round(performance.now() - startedAt),
    },
  };
}

/**
 * Calls the model, checks the answer, and retries once with a stricter prompt.
 * The retry uses the provider's fallback model when it has one, so an
 * overloaded model (Gemini's 503 "high demand") isn't simply asked again.
 */
async function generateSummary(
  provider: Provider,
  mode: SummaryMode,
  title: string,
  text: string,
  signal?: AbortSignal,
): Promise<{ summary: ModelSummary; modelName: string }> {
  let lastProblem: unknown;
  // Both attempts share one budget: when the first fails fast (e.g. an instant 503),
  // the retry gets the rest of the time instead of a fixed slice.
  const budgetMs = provider.timeoutMs * 2;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= 2; attempt++) {
    const attemptMs = attempt === 1 ? provider.timeoutMs : budgetMs - (Date.now() - startedAt);
    if (attemptMs < MIN_ATTEMPT_MS) break; // not enough time left for a useful retry

    const target = attempt > 1 && provider.fallback ? provider.fallback : provider;
    if (target !== provider) {
      console.warn(
        `[ai] ${provider.modelName} failed; retrying with ${target.modelName} (${Math.round(attemptMs / 1000)} s left)`,
      );
    }
    const timeout = AbortSignal.timeout(attemptMs);
    let output: ModelSummary | null;
    try {
      const response = await ai.generate({
        model: target.model,
        system: SYSTEM_PROMPT,
        prompt: buildUserPrompt(mode, title, text, attempt > 1),
        output: { schema: ModelSummarySchema },
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
        throw new ApiError(
          'AI_UNAVAILABLE',
          'The AI model took too long to respond. Please try again.',
          { cause: err },
        );
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

    const checked = checkOutput(output, mode);
    if (checked === NOT_SUMMARISABLE) {
      throw new ApiError('NOT_SUMMARISABLE', "Couldn't find an article on this page.");
    }
    if (checked) return { summary: checked, modelName: target.modelName };
    lastProblem = new Error(`Unusable model output: ${JSON.stringify(output)?.slice(0, 300)}`);
  }

  throw new ApiError(
    'AI_UNAVAILABLE',
    `${provider.label} is busy or gave an unusable answer. Try again in a moment, or switch to the other AI model.`,
    { cause: lastProblem },
  );
}

/** Checks the schema can't express: non-empty fields and the number of key points. */
function checkOutput(
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
