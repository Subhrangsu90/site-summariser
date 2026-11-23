import { isPlatformBrowser } from '@angular/common';
import { afterNextRender, inject, PLATFORM_ID, Service, signal } from '@angular/core';
import type { SummaryMode, SummaryResponse } from '../../../shared/api.types';

export interface HistoryEntry {
  id: string;
  savedAt: number;
  mode: SummaryMode;
  result: SummaryResponse;
}

export const HISTORY_STORAGE_KEY = 'site-summariser.history.v1';
export const HISTORY_LIMIT = 10;

/** The last 10 summaries, kept in this browser's localStorage. */
@Service()
export class SummaryHistory {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly entries = signal<HistoryEntry[]>([]);

  /** Newest first. */
  readonly items = this.entries.asReadonly();

  constructor() {
    // Load after the first render: the prerendered HTML has no history, so
    // reading storage earlier would make the first client render differ from
    // it and break hydration.
    afterNextRender(() => this.entries.set(readStorage()));
  }

  /** Adds a summary. The same page + mode + provider replaces its older entry. */
  add(result: SummaryResponse, mode: SummaryMode): HistoryEntry {
    const entry: HistoryEntry = { id: newId(), savedAt: Date.now(), mode, result };
    const key = entryKey(entry);
    this.entries.update((list) => [entry, ...list.filter((e) => entryKey(e) !== key)].slice(0, HISTORY_LIMIT));
    this.persist();
    return entry;
  }

  remove(id: string): void {
    this.entries.update((list) => list.filter((e) => e.id !== id));
    this.persist();
  }

  clear(): void {
    this.entries.set([]);
    this.persist();
  }

  private persist(): void {
    if (!this.isBrowser) return;
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.entries()));
    } catch {
      // Storage full, blocked or in a private window: history just won't survive a reload.
    }
  }
}

function entryKey(entry: HistoryEntry): string {
  return `${entry.result.source.url}|${entry.mode}|${entry.result.meta.provider}`;
}

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Reads and sanity-checks saved history; anything unexpected is dropped. */
export function readStorage(): HistoryEntry[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter(isHistoryEntry).slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function isHistoryEntry(value: unknown): value is HistoryEntry {
  const e = value as Partial<HistoryEntry> | null;
  return (
    typeof e?.id === 'string' &&
    typeof e.savedAt === 'number' &&
    typeof e.mode === 'string' &&
    typeof e.result?.source?.url === 'string' &&
    typeof e.result.summary?.title === 'string' &&
    Array.isArray(e.result.summary.keyPoints)
  );
}
