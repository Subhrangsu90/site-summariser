import { googleAI } from '@genkit-ai/google-genai';
import type { ModelReference } from 'genkit';
import { z } from 'zod';
import type { ProviderId } from '../../shared/api.types';
import { config } from '../config';
import './genkit'; // registers the Ollama model before anything uses its name

export interface Provider {
  id: ProviderId;
  label: string;
  /** Shown in the UI and in `meta.model`. */
  modelName: string;
  /** What `ai.generate({ model })` gets. */
  model: ModelReference<any> | string;
  /** Tried for the retry when the main model fails, e.g. because it is overloaded. */
  fallback?: { modelName: string; model: ModelReference<any> | string };
  modelConfig: Record<string, unknown>;
  /** Time for the first attempt; the retry gets whatever is left of 2× this. */
  timeoutMs: number;
  /** Size of one model input. Longer pages are split into parts of this size. */
  maxChars: number;
  /** Most parts a long page is split into; text beyond that is left out (`truncated`). */
  maxChunks: number;
  /** Summarise the parts at the same time (cloud) or one after another (a single local GPU/CPU). */
  parallelChunks: boolean;
  /** The whole request, fetch included, must finish within this. */
  requestBudgetMs: number;
}

export interface Availability {
  available: boolean;
  reason?: string;
}

export const PROVIDERS: Record<ProviderId, Provider> = {
  gemini: {
    id: 'gemini',
    label: 'Gemini (cloud)',
    modelName: config.gemini.model,
    model: googleAI.model(config.gemini.model),
    // Gemini sometimes answers 503 "high demand" for one model while another works.
    fallback:
      config.gemini.fallbackModel && config.gemini.fallbackModel !== config.gemini.model
        ? { modelName: config.gemini.fallbackModel, model: googleAI.model(config.gemini.fallbackModel) }
        : undefined,
    // Gemini 3 models are tuned for their default temperature, so we don't lower it.
    modelConfig: {},
    // First attempt; both attempts share 2× this (40 s), capped by requestBudgetMs.
    timeoutMs: 20_000,
    maxChars: 12_000,
    maxChunks: 4, // up to ~48k characters
    parallelChunks: true,
    // Vercel stops a function at 60 s; leave a margin for sending the response.
    requestBudgetMs: 52_000,
  },
  ollama: {
    id: 'ollama',
    label: 'Local (Ollama)',
    modelName: config.ollama.model,
    model: `ollama/${config.ollama.model}`, // registered in genkit.ts
    modelConfig: { temperature: 0.3 },
    // CPU-only: ~15–25 s per summary, more on the first call while the model loads.
    timeoutMs: 120_000,
    // ~3.3 characters per token, so ~2.4k tokens: well inside num_ctx and quick on CPU.
    maxChars: 8_000,
    // ~20–25 s per part on CPU, so 3 parts + the final summary ≈ 1.5 minutes.
    maxChunks: 3,
    parallelChunks: false, // one local model: parallel requests would only queue
    requestBudgetMs: 360_000, // local only, no hosting limit
  },
};

/** The part of Ollama's GET /api/tags answer that we use. */
const OllamaTagsSchema = z.object({
  models: z.array(z.object({ name: z.string(), model: z.string().optional() })).default([]),
});

const OLLAMA_CHECK_TTL_MS = 5_000;
let ollamaCheck: { at: number; result: Availability } | undefined;

/** Fast check used by GET /api/providers and before each summary. */
export async function checkAvailability(id: ProviderId): Promise<Availability> {
  if (id === 'gemini') {
    return config.gemini.apiKey
      ? { available: true }
      : { available: false, reason: 'Add GEMINI_API_KEY to .env to use Gemini.' };
  }

  if (ollamaCheck && Date.now() - ollamaCheck.at < OLLAMA_CHECK_TTL_MS) return ollamaCheck.result;
  const result = await checkOllama();
  ollamaCheck = { at: Date.now(), result };
  return result;
}

async function checkOllama(): Promise<Availability> {
  const { server, model } = config.ollama;
  try {
    const res = await fetch(`${server}/api/tags`, { signal: AbortSignal.timeout(1_500) });
    if (!res.ok) return { available: false, reason: `Ollama answered with HTTP ${res.status}.` };

    const tags = OllamaTagsSchema.safeParse(await res.json());
    if (!tags.success) return { available: false, reason: 'Ollama sent an unexpected answer.' };
    const { models } = tags.data;
    const wanted = model.includes(':') ? model : `${model}:latest`;
    const installed = models.some((m) => m.name === wanted || m.model === wanted);
    return installed
      ? { available: true }
      : { available: false, reason: `Run "ollama pull ${model}" to use the local model.` };
  } catch {
    return {
      available: false,
      reason: 'Ollama is not running. The local model only works when the app runs on your own machine.',
    };
  }
}
