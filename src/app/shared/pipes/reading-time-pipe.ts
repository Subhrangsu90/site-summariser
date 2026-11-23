import { Pipe, PipeTransform } from '@angular/core';

/** 6 → "6 min read" */
@Pipe({
  name: 'readingTime',
})
export class ReadingTimePipe implements PipeTransform {
  transform(minutes: number): string {
    return `${Math.max(1, Math.round(minutes))} min read`;
  }
}
