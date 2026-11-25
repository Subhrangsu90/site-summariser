import { ProviderIdSchema, type ProviderId } from '../shared/api.types';

// Load .env for local development; hosted deployments set real environment variables.
try {
  process.loadEnvFile();
} catch {}

function readString(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value ? value : fallback;
}

/** Like readString, but "none" means "not set". */
function readOptional(name: string, fallback: string): string | undefined {
  const value = readString(name, fallback);
  return value.toLowerCase() === 'none' ? undefined : value;
}

function readInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readProvider(name: string, fallback: ProviderId): ProviderId {
  const parsed = ProviderIdSchema.safeParse(process.env[name]?.trim());
  return parsed.success ? parsed.data : fallback;
}

export const config = {
  defaultProvider: readProvider('DEFAULT_PROVIDER', 'gemini'),
  gemini: {
    apiKey: readString('GEMINI_API_KEY', ''),
    model: readString('GEMINI_MODEL', 'gemini-flash-lite-latest'),
    // Retry model when the main one fails (e.g. 503 "high demand"). "none" turns it off.
    // Pinned rather than a "-latest" alias, which points at the busiest models.
    fallbackModel: readOptional('GEMINI_FALLBACK_MODEL', 'gemini-3.6-flash'),
  },
  ollama: {
    server: readString('OLLAMA_SERVER', 'http://127.0.0.1:11434').replace(/\/+$/, ''),
    model: readString('OLLAMA_MODEL', 'gemma4:e2b'),
    // Ollama's default context is 4096 tokens; longer input hangs or is cut.
    // Changing it reloads the model, so keep it constant.
    numCtx: readInt('OLLAMA_NUM_CTX', 8192),
  },
} as const;
