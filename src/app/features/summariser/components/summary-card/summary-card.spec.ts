import { ComponentFixture, TestBed } from '@angular/core/testing';
import { sampleSummary } from '../../../../testing/sample-summary';
import { SummaryCard } from './summary-card';

describe('SummaryCard', () => {
  let fixture: ComponentFixture<SummaryCard>;
  let el: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(SummaryCard);
    el = fixture.nativeElement;
  });

  async function render(result = sampleSummary()) {
    fixture.componentRef.setInput('result', result);
    await fixture.whenStable();
  }

  it('renders the title, TL;DR and every key point', async () => {
    await render();
    expect(el.querySelector('h2')?.textContent).toContain('Technical debt as a metaphor');
    expect(el.textContent).toContain('Technical debt compares internal code problems');
    const points = [...el.querySelectorAll('li')].map((li) => li.textContent?.trim());
    expect(points).toEqual(['Cruft makes changes slower.', 'Extra effort is the interest.', 'Pay down the principal gradually.']);
  });

  it('shows source, model, reading time, duration and a safe link to the original', async () => {
    await render();
    expect(el.textContent).toContain('martinfowler.com');
    expect(el.textContent).toContain('gemini-flash-lite-latest');
    expect(el.textContent).toContain('5 min read');
    expect(el.textContent).toContain('4.2 s');
    const link = el.querySelector<HTMLAnchorElement>('a[target="_blank"]');
    expect(link?.href).toBe('https://martinfowler.com/bliki/TechnicalDebt.html');
    expect(link?.rel).toContain('noopener');
  });

  it('notes long pages: summarised in parts, or not fully covered', async () => {
    await render();
    expect(el.textContent).not.toContain('Long page');

    const inParts = sampleSummary();
    inParts.meta.chunks = 3;
    await render(inParts);
    expect(el.textContent).toContain('Long page: summarised in 3 parts.');

    const partly = sampleSummary();
    partly.meta.chunks = 4;
    partly.meta.truncated = true;
    await render(partly);
    expect(el.textContent).toContain("Very long page: this summary doesn't cover all of it.");
    expect(el.textContent).not.toContain('summarised in 4 parts');
  });

  it('copies the summary as Markdown and confirms it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render();

    const button = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Copy as Markdown'))!;
    button.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('## Technical debt as a metaphor'));
    expect(button.textContent).toContain('Copied ✓');
  });
});
