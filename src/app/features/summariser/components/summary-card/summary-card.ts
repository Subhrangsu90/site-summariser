import { Component, DestroyRef, inject, input, linkedSignal } from '@angular/core';
import type { SummaryResponse } from '../../../../../shared/api.types';
import { DurationPipe } from '../../../../shared/pipes/duration-pipe';
import { ReadingTimePipe } from '../../../../shared/pipes/reading-time-pipe';
import { toMarkdown, toPlainText } from '../../summary-text';

type CopyState = 'text' | 'markdown' | 'failed' | undefined;

/** Displays one summary, with copy buttons. */
@Component({
  selector: 'app-summary-card',
  imports: [ReadingTimePipe, DurationPipe],
  templateUrl: './summary-card.html',
})
export class SummaryCard {
  readonly result = input.required<SummaryResponse>();

  /** Hide a broken favicon; reset for every new result. */
  protected readonly faviconFailed = linkedSignal({ source: this.result, computation: () => false });

  /** Which copy button last succeeded (or failed); reset for every new result. */
  protected readonly copied = linkedSignal<SummaryResponse, CopyState>({
    source: this.result,
    computation: () => undefined,
  });

  private resetTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.resetTimer));
  }

  protected async copy(format: 'text' | 'markdown'): Promise<void> {
    const text = format === 'markdown' ? toMarkdown(this.result()) : toPlainText(this.result());
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(format);
    } catch {
      this.copied.set('failed'); // e.g. clipboard permission denied, or not a secure context
    }
    clearTimeout(this.resetTimer);
    this.resetTimer = setTimeout(() => this.copied.set(undefined), 2000);
  }
}
