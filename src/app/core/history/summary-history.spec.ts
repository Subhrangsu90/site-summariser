import { TestBed } from '@angular/core/testing';
import { sampleSummary } from '../../testing/sample-summary';
import { HISTORY_LIMIT, HISTORY_STORAGE_KEY, readStorage, SummaryHistory } from './summary-history';

describe('SummaryHistory', () => {
  let history: SummaryHistory;

  beforeEach(() => {
    localStorage.clear();
    history = TestBed.inject(SummaryHistory);
  });

  it('adds newest first and saves to localStorage', () => {
    history.add(sampleSummary({ title: 'First' }), 'tldr');
    const second = sampleSummary({ title: 'Second' });
    second.source.url = 'https://example.com/other';
    history.add(second, 'tldr');

    expect(history.items().map((e) => e.result.summary.title)).toEqual(['Second', 'First']);
    expect(readStorage().map((e) => e.result.summary.title)).toEqual(['Second', 'First']);
  });

  it('replaces the older entry for the same page, mode and provider', () => {
    history.add(sampleSummary({ title: 'Old' }), 'tldr');
    history.add(sampleSummary({ title: 'New' }), 'tldr');
    history.add(sampleSummary({ title: 'Bullets' }), 'bullets'); // different mode: kept separately

    expect(history.items().map((e) => e.result.summary.title)).toEqual(['Bullets', 'New']);
  });

  it(`keeps only the last ${HISTORY_LIMIT}`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 3; i++) {
      const result = sampleSummary({ title: `Page ${i}` });
      result.source.url = `https://example.com/${i}`;
      history.add(result, 'tldr');
    }
    expect(history.items()).toHaveLength(HISTORY_LIMIT);
    expect(history.items()[0].result.summary.title).toBe(`Page ${HISTORY_LIMIT + 2}`);
  });

  it('removes one entry or clears all', () => {
    const entry = history.add(sampleSummary(), 'tldr');
    history.remove(entry.id);
    expect(history.items()).toEqual([]);

    history.add(sampleSummary(), 'tldr');
    history.clear();
    expect(readStorage()).toEqual([]);
  });

  it('ignores corrupt or unexpected saved data', () => {
    localStorage.setItem(HISTORY_STORAGE_KEY, '{not json');
    expect(readStorage()).toEqual([]);

    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([{ id: 1 }, 'junk', null]));
    expect(readStorage()).toEqual([]);
  });
});
