import * as z from 'zod/mini';

/**
 * API contract shared by the client and the server. Bundled into the browser,
 * so it uses the tree-shakable `zod/mini` and no Node or Angular imports.
 */

export const SUMMARY_MODES = ['tldr', 'bullets', 'detailed'] as const;
export const SummaryModeSchema = z.enum(SUMMARY_MODES);
export type SummaryMode = z.infer<typeof SummaryModeSchema>;

export const PROVIDER_IDS = ['gemini', 'ollama'] as const;
export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const MAX_URL_LENGTH = 2048;

/** POST /api/summarise */
export const SummariseRequestSchema = z.object({
  // The full URL check (scheme, SSRF guard) is server-only: src/server/utils/validate-url.ts.
  url: z.string().check(z.trim(), z.minLength(1), z.maxLength(MAX_URL_LENGTH)),
  mode: z._default(SummaryModeSchema, 'tldr'),
  /** Defaults to the server's DEFAULT_PROVIDER. */
  provider: z.optional(ProviderIdSchema),
});
export type SummariseRequest = z.infer<typeof SummariseRequestSchema>;

export const SummarySourceSchema = z.object({
  url: z.string(),
  siteName: z.string(),
  title: z.string(),
  favicon: z.nullable(z.string()),
});
export type SummarySource = z.infer<typeof SummarySourceSchema>;

export const SummarySchema = z.object({
  title: z.string(),
  tldr: z.string(),
  keyPoints: z.array(z.string()),
  /** Calculated on the server from the word count (~200 words a minute). */
  readingTimeMin: z.int().check(z.positive()),
});
export type Summary = z.infer<typeof SummarySchema>;

export const SummaryMetaSchema = z.object({
  provider: ProviderIdSchema,
  model: z.string(),
  /** True when some of the page isn't covered: too long even in parts, or a part couldn't be summarised. */
  truncated: z.boolean(),
  /** How many parts the page was summarised in (1 = in one go; more for long pages). */
  chunks: z.int().check(z.positive()),
  ms: z.number().check(z.nonnegative()),
});
export type SummaryMeta = z.infer<typeof SummaryMetaSchema>;

export const SummaryResponseSchema = z.object({
  source: SummarySourceSchema,
  summary: SummarySchema,
  meta: SummaryMetaSchema,
});
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

/** GET /api/providers */
export const ProviderInfoSchema = z.object({
  id: ProviderIdSchema,
  label: z.string(),
  model: z.string(),
  available: z.boolean(),
  /** Why it is unavailable, shown in the UI. */
  reason: z.optional(z.string()),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

export const ProvidersResponseSchema = z.object({
  default: ProviderIdSchema,
  providers: z.array(ProviderInfoSchema),
});
export type ProvidersResponse = z.infer<typeof ProvidersResponseSchema>;

export const ERROR_CODES = [
  'INVALID_REQUEST',
  'INVALID_URL',
  'BLOCKED_URL',
  'NO_CONTENT',
  'NOT_SUMMARISABLE',
  'FETCH_FAILED',
  'TIMEOUT',
  'AI_UNAVAILABLE',
  'PROVIDER_UNAVAILABLE',
  'NOT_FOUND',
  'INTERNAL',
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Every API error has this shape. */
export const ApiErrorBodySchema = z.object({
  error: z.object({ code: ErrorCodeSchema, message: z.string() }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;
