import { Pipe, PipeTransform } from '@angular/core';

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** A timestamp as "just now", "5 minutes ago", "yesterday", "3 weeks ago". */
@Pipe({
  name: 'relativeTime',
})
export class RelativeTimePipe implements PipeTransform {
  transform(timestamp: number, now: number = Date.now()): string {
    const seconds = Math.round((timestamp - now) / 1000);
    if (Math.abs(seconds) < 45) return 'just now';
    const [unit, size] = UNITS.find(([, size]) => Math.abs(seconds) >= size) ?? ['minute', 60];
    return formatter.format(Math.round(seconds / size), unit);
  }
}
