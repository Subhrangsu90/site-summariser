import { sampleSummary } from '../../testing/sample-summary';
import { toMarkdown, toPlainText } from './summary-text';

describe('summary text', () => {
  it('formats Markdown with a heading, bullet points and a source link', () => {
    const md = toMarkdown(sampleSummary());
    expect(md).toContain('## Technical debt as a metaphor');
    expect(md).toContain('- Cruft makes changes slower.');
    expect(md).toContain('Source: [bliki: Technical Debt](https://martinfowler.com/bliki/TechnicalDebt.html) · 5 min read');
  });

  it('escapes square brackets in the link text', () => {
    const result = sampleSummary();
    result.source.title = 'Debt [part 1]';
    expect(toMarkdown(result)).toContain('[Debt \\[part 1\\]](');
  });

  it('formats plain text without Markdown syntax', () => {
    const text = toPlainText(sampleSummary());
    expect(text.startsWith('Technical debt as a metaphor\n')).toBe(true);
    expect(text).toContain('• Extra effort is the interest.');
    expect(text).not.toContain('##');
  });
});
