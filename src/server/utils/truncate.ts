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

export interface SplitResult {
  chunks: string[];
  /** True when text was left over after `maxChunks` parts. */
  truncated: boolean;
}

/**
 * Splits text into parts of at most ~`maxChars`, each ending at a sentence
 * boundary where possible (same rules as `truncate`). Stops after `maxChunks`.
 * A small tail (≤ 15% of a part) is added to the last part instead of costing
 * a model call of its own.
 */
export function splitIntoChunks(text: string, maxChars: number, maxChunks: number): SplitResult {
  const chunks: string[] = [];
  let rest = text.trim();

  while (rest && chunks.length < maxChunks) {
    const { text: piece } = truncate(rest, maxChars);
    chunks.push(piece);
    rest = rest.slice(piece.length).trimStart();

    if (rest && rest.length <= maxChars * 0.15) {
      chunks[chunks.length - 1] += ` ${rest}`;
      rest = '';
    }
  }
  return { chunks, truncated: rest.length > 0 };
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}
