/**
 * API contract shared by the Angular client and the Express server.
 * Keep this file free of runtime dependencies: it is bundled into the browser.
 */

export const SUMMARY_MODES = ['tldr', 'bullets', 'detailed'] as const;
export type SummaryMode = (typeof SUMMARY_MODES)[number];

export const PROVIDER_IDS = ['gemini', 'ollama'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** POST /api/summarise */
export interface SummariseRequest {
  url: string;
  mode: SummaryMode;
  /** Defaults to the server's DEFAULT_PROVIDER. */
  provider?: ProviderId;
}

export interface SummarySource {
  url: string;
  siteName: string;
  title: string;
  favicon: string | null;
}

export interface Summary {
  title: string;
  tldr: string;
  keyPoints: string[];
  /** Calculated on the server from the word count (~200 words a minute). */
  readingTimeMin: number;
}

export interface SummaryMeta {
  provider: ProviderId;
  model: string;
  /** True when the page was cut to fit the model's input limit. */
  truncated: boolean;
  ms: number;
}

export interface SummaryResponse {
  source: SummarySource;
  summary: Summary;
  meta: SummaryMeta;
}

/** GET /api/providers */
export interface ProviderInfo {
  id: ProviderId;
  label: string;
  model: string;
  available: boolean;
  /** Why it is unavailable, shown in the UI. */
  reason?: string;
}

export interface ProvidersResponse {
  default: ProviderId;
  providers: ProviderInfo[];
}

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
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Every API error has this shape. */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}
