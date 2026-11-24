import { describe, expect, it } from 'vitest';
import { countWords, splitIntoChunks, truncate } from './truncate';

describe('splitIntoChunks', () => {
  const sentence = (i: number) => `Sentence number ${i} is here.`; // 26–28 chars
  const text = Array.from({ length: 40 }, (_, i) => sentence(i + 1)).join(' '); // ~1,150 chars

  it('keeps short text as one part', () => {
    expect(splitIntoChunks('Short text.', 100, 4)).toEqual({ chunks: ['Short text.'], truncated: false });
  });

  it('splits at sentence boundaries without losing or repeating text', () => {
    const { chunks, truncated } = splitIntoChunks(text, 300, 10);
    expect(truncated).toBe(false);
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(chunk.endsWith('.')).toBe(true);
      expect(chunk.length).toBeLessThanOrEqual(300 * 1.15 + 30); // a small tail may join the last part
    }
    expect(chunks.join(' ')).toBe(text);
  });

  it('stops after maxChunks and reports the rest as truncated', () => {
    const { chunks, truncated } = splitIntoChunks(text, 300, 2);
    expect(chunks).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it('adds a small tail to the last part instead of making a tiny part', () => {
    const { chunks } = splitIntoChunks(`${'a'.repeat(95)}. Tail.`, 100, 4);
    expect(chunks).toEqual([`${'a'.repeat(95)}. Tail.`]);
  });
});

describe('truncate', () => {
  it('leaves text within the limit unchanged', () => {
    expect(truncate('Short text.', 100)).toEqual({ text: 'Short text.', truncated: false });
  });

  it('cuts at the last sentence boundary before the limit', () => {
    const text = 'First sentence here. Second sentence is here. Third one goes past the limit.';
    const result = truncate(text, 50);
    expect(result).toEqual({ text: 'First sentence here. Second sentence is here.', truncated: true });
    expect(result.text.length).toBeLessThanOrEqual(50);
  });

  it('counts a sentence that ends exactly at the limit', () => {
    const text = 'Exactly twenty six chars. More text follows here.';
    expect(truncate(text, 25).text).toBe('Exactly twenty six chars.');
  });

  it('handles ! ? and closing quotes', () => {
    expect(truncate('Is it? "Yes!" And then something much longer follows.', 15).text).toBe('Is it? "Yes!"');
  });

  it('falls back to the last space when no sentence ends late enough', () => {
    const text = 'One. ' + 'word '.repeat(30);
    const result = truncate(text, 60);
    expect(result.truncated).toBe(true);
    expect(result.text.endsWith('word')).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(60);
  });

  it('hard-cuts text with no spaces', () => {
    expect(truncate('x'.repeat(100), 40)).toEqual({ text: 'x'.repeat(40), truncated: true });
  });
});

describe('countWords', () => {
  it('counts words across any whitespace', () => {
    expect(countWords('  one two\nthree\t four  ')).toBe(4);
    expect(countWords('')).toBe(0);
  });
});
