import { Component, computed, input, linkedSignal, output } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import type {
  ProviderId,
  ProviderInfo,
  ProvidersResponse,
  SummariseRequest,
  SummaryMode,
} from '../../../../../shared/api.types';

interface UrlFormModel {
  url: string;
  mode: SummaryMode;
  provider: ProviderId;
}

/** Shown until GET /api/providers answers. */
const FALLBACK_PROVIDERS: ProviderInfo[] = [
  { id: 'gemini', label: 'Gemini (cloud)', model: '', available: true },
  { id: 'ollama', label: 'Local (Ollama)', model: '', available: true },
];

/** Adds https:// when the user leaves out the scheme ("example.com" → "https://example.com"). */
export function withScheme(raw: string): string {
  const value = raw.trim();
  return /^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`;
}

/** Client-side URL check. The server checks again, including the SSRF guard. */
export function urlProblem(raw: string): string | undefined {
  if (!raw.trim()) return undefined; // required() covers empty
  let url: URL;
  try {
    url = new URL(withScheme(raw));
  } catch {
    return "That doesn't look like a web address.";
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http and https links are supported.';
  if (!url.hostname.includes('.')) return 'Enter a full address, like example.com/article.';
  return undefined;
}

@Component({
  selector: 'app-url-form',
  imports: [FormField],
  templateUrl: './url-form.html',
  styleUrl: './url-form.css',
})
export class UrlForm {
  readonly loading = input(false);
  readonly providers = input<ProvidersResponse | undefined>(undefined);
  readonly submitted = output<SummariseRequest>();

  /**
   * The form model. A linkedSignal so that when the provider list arrives, an
   * unavailable choice (e.g. Gemini without a key) switches to an available
   * one, while keeping whatever URL the user has already typed.
   */
  protected readonly model = linkedSignal<ProvidersResponse | undefined, UrlFormModel>({
    source: this.providers,
    computation: (info, previous) => {
      const current = previous?.value ?? { url: '', mode: 'tldr', provider: info?.default ?? 'gemini' };
      if (!info) return current;

      const isAvailable = (id: ProviderId) => info.providers.some((p) => p.id === id && p.available);
      if (isAvailable(current.provider)) return current;
      const fallback = isAvailable(info.default) ? info.default : info.providers.find((p) => p.available)?.id;
      return fallback ? { ...current, provider: fallback } : current;
    },
  });

  protected readonly urlForm = form(this.model, (path) => {
    required(path.url, { message: 'Paste a link to summarise.' });
    validate(path.url, ({ value }) => {
      const problem = urlProblem(value());
      return problem ? { kind: 'url', message: problem } : undefined;
    });
    validate(path.provider, ({ value }) => {
      const info = this.providers()?.providers.find((p) => p.id === value());
      return info && !info.available
        ? { kind: 'unavailable', message: info.reason ?? `${info.label} is not available.` }
        : undefined;
    });
  });

  protected readonly providerOptions = computed(() => this.providers()?.providers ?? FALLBACK_PROVIDERS);

  protected readonly urlError = computed(() => {
    const field = this.urlForm.url();
    return field.touched() ? field.errors()[0]?.message : undefined;
  });

  protected readonly providerError = computed(() => this.urlForm.provider().errors()[0]?.message);

  protected isAvailable(id: ProviderId): boolean {
    return this.providerOptions().find((p) => p.id === id)?.available ?? false;
  }

  protected modelName(id: ProviderId): string {
    return this.providerOptions().find((p) => p.id === id)?.model ?? '';
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void submit(this.urlForm, async () => {
      const { url, mode, provider } = this.model();
      const normalised = withScheme(url);
      this.model.update((m) => ({ ...m, url: normalised })); // show the user what was sent
      this.submitted.emit({ url: normalised, mode, provider });
    });
  }
}
