import { Component, input, output } from '@angular/core';
import type { SummaryMode } from '../../../../../shared/api.types';
import type { HistoryEntry } from '../../../../core/history/summary-history';
import { RelativeTimePipe } from '../../../../shared/pipes/relative-time-pipe';

const MODE_LABELS: Record<SummaryMode, string> = {
  tldr: 'TL;DR',
  bullets: 'Bullets',
  detailed: 'Detailed',
};

@Component({
  selector: 'app-history-list',
  imports: [RelativeTimePipe],
  templateUrl: './history-list.html',
})
export class HistoryList {
  readonly entries = input.required<HistoryEntry[]>();
  readonly activeId = input<string | undefined>(undefined);

  readonly open = output<HistoryEntry>();
  readonly remove = output<string>();
  readonly clear = output<void>();

  protected readonly modeLabels = MODE_LABELS;
}
