import type { ProvidersResponse, SummaryResponse } from '../../shared/api.types';

export function sampleSummary(overrides: Partial<SummaryResponse['summary']> = {}): SummaryResponse {
  return {
    source: {
      url: 'https://martinfowler.com/bliki/TechnicalDebt.html',
      siteName: 'martinfowler.com',
      title: 'bliki: Technical Debt',
      favicon: 'https://martinfowler.com/favicon.ico',
    },
    summary: {
      title: 'Technical debt as a metaphor',
      tldr: 'Technical debt compares internal code problems to financial debt.',
      keyPoints: ['Cruft makes changes slower.', 'Extra effort is the interest.', 'Pay down the principal gradually.'],
      readingTimeMin: 5,
      ...overrides,
    },
    meta: { provider: 'gemini', model: 'gemini-flash-lite-latest', truncated: false, chunks: 1, ms: 4174 },
  };
}

export function sampleProviders(available: { gemini: boolean; ollama: boolean }): ProvidersResponse {
  return {
    default: 'gemini',
    providers: [
      {
        id: 'gemini',
        label: 'Gemini (cloud)',
        model: 'gemini-flash-lite-latest',
        available: available.gemini,
        ...(available.gemini ? {} : { reason: 'Add GEMINI_API_KEY to .env to use Gemini.' }),
      },
      {
        id: 'ollama',
        label: 'Local (Ollama)',
        model: 'gemma4:e2b',
        available: available.ollama,
        ...(available.ollama ? {} : { reason: 'Ollama is not running.' }),
      },
    ],
  };
}
