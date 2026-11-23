import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { SummariseRequest } from '../../../../../shared/api.types';
import { sampleProviders } from '../../../../testing/sample-summary';
import { UrlForm, urlProblem, withScheme } from './url-form';

describe('withScheme / urlProblem', () => {
  it('adds https:// only when the scheme is missing', () => {
    expect(withScheme(' example.com/a ')).toBe('https://example.com/a');
    expect(withScheme('http://example.com')).toBe('http://example.com');
  });

  it('flags addresses the server would reject', () => {
    expect(urlProblem('example.com/article')).toBeUndefined();
    expect(urlProblem('')).toBeUndefined(); // "required" handles empty
    expect(urlProblem('ftp://example.com')).toContain('http and https');
    expect(urlProblem('localhost')).toContain('full address');
    expect(urlProblem('http://')).toBeDefined();
  });
});

describe('UrlForm', () => {
  let fixture: ComponentFixture<UrlForm>;
  let el: HTMLElement;
  let input: HTMLInputElement;
  let submitButton: HTMLButtonElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(UrlForm);
    el = fixture.nativeElement;
    await fixture.whenStable();
    input = el.querySelector('#page-url')!;
    submitButton = el.querySelector('button[type="submit"]')!;
  });

  async function type(value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('disables submit while the address is empty or invalid', async () => {
    expect(submitButton.disabled).toBe(true);

    await type('not a url');
    expect(submitButton.disabled).toBe(true);

    await type('example.com/article');
    expect(submitButton.disabled).toBe(false);
  });

  it('shows the validation message once the field is touched', async () => {
    await type('localhost');
    expect(el.querySelector('#page-url-error')).toBeNull();

    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(el.querySelector('#page-url-error')?.textContent).toContain('full address');
  });

  it('emits the request with https:// added', async () => {
    const submitted: SummariseRequest[] = [];
    fixture.componentInstance.submitted.subscribe((r) => submitted.push(r));

    await type('example.com/article');
    el.querySelector<HTMLInputElement>('input[value="bullets"]')!.click();
    await fixture.whenStable();
    submitButton.click();
    await fixture.whenStable();

    expect(submitted).toEqual([{ url: 'https://example.com/article', mode: 'bullets', provider: 'gemini' }]);
  });

  it('switches to an available provider when the list arrives, keeping the typed URL', async () => {
    await type('example.com/article');
    fixture.componentRef.setInput('providers', sampleProviders({ gemini: false, ollama: true }));
    await fixture.whenStable();

    expect(el.querySelector<HTMLInputElement>('input[value="ollama"]')!.checked).toBe(true);
    expect(input.value).toBe('example.com/article');
  });

  it('disables submit while loading', async () => {
    await type('example.com/article');
    fixture.componentRef.setInput('loading', true);
    await fixture.whenStable();
    expect(submitButton.disabled).toBe(true);
    expect(submitButton.textContent).toContain('Summarising');
  });
});
