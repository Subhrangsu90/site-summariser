import { PROVIDER_IDS, type ProviderId } from '../shared/api.types';

// Load .env for local development. On a host like Render the variables are set
// in the dashboard and there is no .env file, which is fine.
try {
  process.loadEnvFile();
} catch {
  // No .env file: use the real environment.
}

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
  const value = process.env[name]?.trim() as ProviderId | undefined;
  return value && PROVIDER_IDS.includes(value) ? value : fallback;
}

/** All environment configuration, read once at startup. Server-only. */
export const config = {
  defaultProvider: readProvider('DEFAULT_PROVIDER', 'gemini'),
  gemini: {
    apiKey: readString('GEMINI_API_KEY', ''),
    // Flash-Lite: ~4–5 s per summary in testing.
    model: readString('GEMINI_MODEL', 'gemini-flash-lite-latest'),
    // Used for the retry when the main model fails (e.g. 503 "high demand"). "none" turns it off.
    // A pinned previous-generation model: the "-latest" aliases point at the newest, busiest
    // models (gemini-flash-latest returned 503 while gemini-3.6-flash answered).
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
