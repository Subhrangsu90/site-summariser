import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { sampleProviders, sampleSummary } from '../../testing/sample-summary';
import { Summariser } from './summariser';

describe('Summariser page', () => {
  let fixture: ComponentFixture<Summariser>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Summariser);
    el = fixture.nativeElement;
    // whenStable() waits for open HTTP requests, so render with tick(), answer, then wait.
    TestBed.tick();
    http.expectOne('/api/providers').flush(sampleProviders({ gemini: true, ollama: true }));
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  /** Types a URL and submits. Leaves the request open (rendered with tick()) for the test to answer. */
  async function submit(url: string) {
    const input = el.querySelector<HTMLInputElement>('#page-url')!;
    input.value = url;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    el.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await Promise.resolve(); // submit() runs its action asynchronously
    TestBed.tick();
  }

  it('starts idle, with nothing requested', () => {
    expect(el.textContent).toContain('Your summary will appear here');
    http.expectNone('/api/summarise');
  });

  it('goes idle → loading → success', async () => {
    await submit('martinfowler.com/bliki/TechnicalDebt.html');

    expect(el.querySelector('app-loading-skeleton')).not.toBeNull();
    const req = http.expectOne({ method: 'POST', url: '/api/summarise' });
    expect(req.request.body).toEqual({
      url: 'https://martinfowler.com/bliki/TechnicalDebt.html',
      mode: 'tldr',
      provider: 'gemini',
    });

    req.flush(sampleSummary());
    await fixture.whenStable();

    expect(el.querySelector('app-loading-skeleton')).toBeNull();
    expect(el.querySelector('app-summary-card h2')?.textContent).toContain('Technical debt as a metaphor');
    expect(el.textContent).toContain('Recent summaries'); // saved to history
  });

  it('goes idle → loading → error, with a friendly message and no pointless retry', async () => {
    await submit('example.com/private');
    http
      .expectOne('/api/summarise')
      .flush(
        { error: { code: 'BLOCKED_URL', message: "This address can't be summarised." } },
        { status: 403, statusText: 'Forbidden' },
      );
    await fixture.whenStable();

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("This address can't be summarised");
    expect(alert?.querySelector('button')).toBeNull();
  });

  it('offers "Try again" for temporary errors and retries the same request', async () => {
    await submit('example.com/article');
    http
      .expectOne('/api/summarise')
      .flush({ error: { code: 'TIMEOUT', message: 'The site took too long to respond.' } }, { status: 504, statusText: 'Gateway Timeout' });
    await fixture.whenStable();

    el.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
    TestBed.tick();
    const retry = http.expectOne('/api/summarise');
    expect(retry.request.body.url).toBe('https://example.com/article');
    retry.flush(sampleSummary());
    await fixture.whenStable();
    expect(el.querySelector('app-summary-card')).not.toBeNull();
  });
});
