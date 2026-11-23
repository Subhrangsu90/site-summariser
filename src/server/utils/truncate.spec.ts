import { describe, expect, it } from 'vitest';
import { countWords, truncate } from './truncate';

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
