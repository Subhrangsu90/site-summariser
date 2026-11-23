export interface TruncateResult {
  text: string;
  truncated: boolean;
}

/** A sentence end: . ! or ? (optionally followed by a closing quote or bracket) before whitespace. */
const SENTENCE_END = /[.!?]["'”’)\]]?(?=\s)/g;

/**
 * Cuts text to at most `maxChars`, preferring the last sentence boundary.
 * Falls back to the last space, then a hard cut, if no boundary is close enough.
 */
export function truncate(text: string, maxChars: number): TruncateResult {
  if (text.length <= maxChars) return { text, truncated: false };

  // Look one character past the limit so a sentence ending exactly at the limit still counts.
  const window = text.slice(0, maxChars + 1);
  const minCut = Math.floor(maxChars * 0.6);

  let cut = -1;
  for (const match of window.matchAll(SENTENCE_END)) {
    const end = match.index + match[0].length;
    if (end <= maxChars) cut = end;
  }
  if (cut < minCut) {
    const space = window.lastIndexOf(' ', maxChars);
    cut = space >= minCut ? space : maxChars;
  }
  return { text: text.slice(0, cut).trimEnd(), truncated: true };
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
