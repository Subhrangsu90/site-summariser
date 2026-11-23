import { z } from 'genkit';

/**
 * What the model must return. Uses Genkit's `z` (not the app's zod package) so
 * Genkit can turn it into a JSON schema.
 *
 * No min/max on arrays or strings: Gemini's schema support rejects them, so
 * counts are asked for in the prompt and checked in code (see summarise.service.ts).
 */
export const ModelSummarySchema = z.object({
  title: z.string().describe('Short headline for the page, at most 12 words'),
  tldr: z.string().describe('The summary, or exactly NOT_SUMMARISABLE if the text is not an article'),
  keyPoints: z.array(z.string()).describe('Key points, one sentence each'),
});

export type ModelSummary = z.infer<typeof ModelSummarySchema>;

export const NOT_SUMMARISABLE = 'NOT_SUMMARISABLE';
