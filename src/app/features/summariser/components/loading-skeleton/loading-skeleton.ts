import { afterNextRender, Component, computed, DestroyRef, inject, input, signal } from '@angular/core';
import type { ProviderId } from '../../../../../shared/api.types';

@Component({
  selector: 'app-loading-skeleton',
  templateUrl: './loading-skeleton.html',
})
export class LoadingSkeleton {
  readonly provider = input<ProviderId | undefined>(undefined);

  protected readonly seconds = signal(0);

  protected readonly hint = computed(() =>
    this.provider() === 'ollama'
      ? 'Running Gemma on this computer. The first run can take up to a minute, long pages longer.'
      : 'This usually takes a few seconds, a little longer for long pages.',
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    // Browser only: never start a timer during server rendering.
    afterNextRender(() => {
      const timer = setInterval(() => this.seconds.update((s) => s + 1), 1000);
      destroyRef.onDestroy(() => clearInterval(timer));
    });
  }
}
