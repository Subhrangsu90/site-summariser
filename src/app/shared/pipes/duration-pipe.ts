import { Pipe, PipeTransform } from '@angular/core';

/** Milliseconds as a short duration: 640 → "640 ms", 2140 → "2.1 s", 46538 → "47 s". */
@Pipe({
  name: 'duration',
})
export class DurationPipe implements PipeTransform {
  transform(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    const seconds = ms / 1000;
    return seconds < 10 ? `${seconds.toFixed(1)} s` : `${Math.round(seconds)} s`;
  }
}
