import { Component, computed, effect, ElementRef, inject, signal, untracked, viewChild } from '@angular/core';
import type { SummariseRequest, SummaryResponse } from '../../../shared/api.types';
import { SummariserApi } from '../../core/api/summariser-api';
import { toUiError } from '../../core/api/ui-error';
import { SummaryHistory, type HistoryEntry } from '../../core/history/summary-history';
import { ErrorState } from './components/error-state/error-state';
import { HistoryList } from './components/history-list/history-list';
import { LoadingSkeleton } from './components/loading-skeleton/loading-skeleton';
import { SummaryCard } from './components/summary-card/summary-card';
import { UrlForm } from './components/url-form/url-form';

interface SetupProblem {
  title: string;
  lines: string[];
}

/**
 * The summariser screen (smart container). It owns the state and the
 * child components only display it.
 *
 * Pattern from angular.dev/ai/design-patterns: the form's live value is kept
 * separate from the submitted `request`, and only `request` drives the
 * httpResource, so nothing is fetched while the user types.
 */
@Component({
  selector: 'app-summariser',
  imports: [UrlForm, SummaryCard, LoadingSkeleton, ErrorState, HistoryList],
  templateUrl: './summariser.html',
  styleUrl: './summariser.css',
})
export class Summariser {
  private readonly api = inject(SummariserApi);
  private readonly history = inject(SummaryHistory);
  private readonly resultRegion = viewChild<ElementRef<HTMLElement>>('resultRegion');

  protected readonly request = signal<SummariseRequest | undefined>(undefined);
  protected readonly summary = this.api.summarise(this.request);
  protected readonly error = computed(() => toUiError(this.summary.error()));

  /** A summary reopened from history (shown instead of a live result). */
  protected readonly reopened = signal<HistoryEntry | undefined>(undefined);
  protected readonly historyItems = this.history.items;

  /** What the card shows: a reopened entry, or the latest live result. */
  protected readonly result = computed<SummaryResponse | undefined>(
    () => this.reopened()?.result ?? (this.summary.hasValue() ? this.summary.value() : undefined),
  );

  protected readonly providers = computed(() =>
    this.api.providers.hasValue() ? this.api.providers.value() : undefined,
  );

  /** Shown when no AI model can be used at all, with what to do about it. */
  protected readonly setupProblem = computed<SetupProblem | undefined>(() => {
    if (this.api.providers.error()) {
      return { title: "Can't reach the server", lines: ['Check that the app server is running, then reload the page.'] };
    }
    const info = this.providers();
    if (!info || info.providers.some((p) => p.available)) return undefined;
    return {
      title: 'No AI model is set up yet',
      lines: info.providers.map((p) => `${p.label}: ${p.reason ?? 'not available.'}`),
    };
  });

  constructor() {
    // Save every new live result to history. An effect fits here: it syncs
    // state out to localStorage and changes nothing the template reads.
    let saved: SummaryResponse | undefined;
    effect(() => {
      if (!this.summary.hasValue()) return;
      const result = this.summary.value();
      const mode = untracked(this.request)?.mode;
      if (mode && result !== saved) {
        saved = result;
        untracked(() => this.history.add(result, mode));
      }
    });
  }

  protected summarise(request: SummariseRequest): void {
    this.reopened.set(undefined);
    // Always a new object, so submitting the same URL again runs again.
    this.request.set({ ...request });
  }

  protected retry(): void {
    this.summary.reload();
  }

  protected reopen(entry: HistoryEntry): void {
    this.request.set(undefined); // cancels a running request and clears its state
    this.reopened.set(entry);
    this.resultRegion()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  protected removeFromHistory(id: string): void {
    this.history.remove(id);
  }

  protected clearHistory(): void {
    this.history.clear();
  }
}
