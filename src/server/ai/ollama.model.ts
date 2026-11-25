import { GenkitError, z, type Genkit, type MessageData } from 'genkit';

/**
 * A Genkit model for a local Ollama model, calling POST /api/chat directly.
 *
 * Why not the `genkitx-ollama` plugin: it puts all config inside Ollama's
 * `options`, so it can't send the top-level `think` and `format` fields.
 * - think: false makes replies several times faster on CPU.
 * - format: <JSON schema> makes Ollama return JSON that matches the schema.
 */

export const OllamaConfigSchema = z.object({
  temperature: z.number().min(0).max(2).optional(),
});

export interface OllamaModelOptions {
  /** e.g. http://127.0.0.1:11434 */
  server: string;
  /** e.g. gemma4:e2b */
  model: string;
  /** Context window in tokens. Kept constant: changing it reloads the model. */
  numCtx: number;
}

interface OllamaChatResponse {
  message?: { role: string; content: string };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export function defineOllamaModel(ai: Genkit, opts: OllamaModelOptions) {
  return ai.defineModel(
    {
      apiVersion: 'v2',
      name: `ollama/${opts.model}`,
      label: `Ollama - ${opts.model}`,
      configSchema: OllamaConfigSchema,
      supports: {
        multiturn: true,
        systemRole: true,
        media: false,
        tools: false,
        output: ['text', 'json'],
        // Tells Genkit to pass our JSON schema through instead of adding format instructions to the prompt.
        constrained: 'all',
      },
    },
    async (request, { abortSignal }) => {
      const schema = request.output?.constrained ? request.output.schema : undefined;
      const body = {
        model: opts.model,
        messages: request.messages.map(toOllamaMessage),
        stream: false,

        think: false,
        format: schema ?? (request.output?.format === 'json' ? 'json' : undefined),
        keep_alive: '10m',
        options: { temperature: request.config?.temperature, num_ctx: opts.numCtx },
      };

      let res: Response;
      try {
        res = await fetch(`${opts.server}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: abortSignal,
        });
      } catch (err) {
        if (abortSignal.aborted) throw err;
        throw new GenkitError({ status: 'UNAVAILABLE', message: `Ollama is not reachable at ${opts.server}.` });
      }

      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        throw new GenkitError({
          // 404 = model not pulled
          status: res.status === 404 ? 'NOT_FOUND' : 'UNAVAILABLE',
          message: `Ollama returned HTTP ${res.status}: ${detail}`,
        });
      }

      const result = await readJson(res);

      return {
        message: { role: 'model', content: [{ text: result.text }] },
        finishReason: result.done_reason === 'length' ? 'length' : 'stop',
        usage: { inputTokens: result.prompt_eval_count, outputTokens: result.eval_count },
      };
    },
  );
}

function toOllamaMessage(message: MessageData) {
  const role = message.role === 'model' ? 'assistant' : message.role;
  return { role, content: message.content.map((part) => part.text ?? '').join('') };
}

async function readJson(res: Response): Promise<OllamaChatResponse & { text: string }> {
  const data = (await res.json()) as OllamaChatResponse;
  if (data.error) throw new GenkitError({ status: 'INTERNAL', message: `Ollama: ${data.error}` });
  return { ...data, text: data.message?.content ?? '' };
}
