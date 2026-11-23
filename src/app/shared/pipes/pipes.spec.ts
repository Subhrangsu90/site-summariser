import { DurationPipe } from './duration-pipe';
import { ReadingTimePipe } from './reading-time-pipe';
import { RelativeTimePipe } from './relative-time-pipe';

describe('pipes', () => {
  it('readingTime rounds and never shows 0', () => {
    const pipe = new ReadingTimePipe();
    expect(pipe.transform(6.4)).toBe('6 min read');
    expect(pipe.transform(0)).toBe('1 min read');
  });

  it('duration picks a readable unit', () => {
    const pipe = new DurationPipe();
    expect(pipe.transform(640)).toBe('640 ms');
    expect(pipe.transform(2140)).toBe('2.1 s');
    expect(pipe.transform(46538)).toBe('47 s');
  });

  it('relativeTime describes how long ago', () => {
    const pipe = new RelativeTimePipe();
    const now = Date.UTC(2026, 10, 24, 12, 0, 0);
    expect(pipe.transform(now - 10_000, now)).toBe('just now');
    expect(pipe.transform(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(pipe.transform(now - 3 * 3600_000, now)).toBe('3 hours ago');
    expect(pipe.transform(now - 24 * 3600_000, now)).toBe('yesterday');
  });
});
