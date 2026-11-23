import { googleAI } from '@genkit-ai/google-genai';
import { genkit } from 'genkit';
import { config } from '../config';
import { defineOllamaModel } from './ollama.model';

/** The one Genkit instance. Both providers are called through `ai.generate`. */
export const ai = genkit({
  // Only register Gemini when there is a key: without one, every call to it fails.
  plugins: config.gemini.apiKey ? [googleAI({ apiKey: config.gemini.apiKey })] : [],
});

/** Registered as `ollama/<OLLAMA_MODEL>`, e.g. `ollama/gemma4:e2b`. */
export const ollamaModel = defineOllamaModel(ai, config.ollama);
