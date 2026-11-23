import { Readability } from '@mozilla/readability';
import { JSDOM, VirtualConsole } from 'jsdom';
import { ApiError } from '../utils/api-error';
import { countWords } from '../utils/truncate';
import { assertPublicUrl } from '../utils/validate-url';

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;
/** Below this, the page is probably rendered by JavaScript or isn't an article. */
const MIN_WORDS = 200;
/**
 * Tried in order. Some sites only serve browsers (e.g. medium.com), others
 * reject a client that claims to be Chrome but isn't (e.g. w3.org), so a 403
 * with the first one is retried once with the second.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (compatible; SiteSummariser/1.0)',
];

export interface ScrapedPage {
  /** Final URL after redirects. */
  url: string;
  title: string;
  siteName: string;
  favicon: string | null;
  text: string;
  wordCount: number;
}

/** Fetches a public web page and extracts its main readable text. */
export async function scrapePage(rawUrl: string, signal?: AbortSignal): Promise<ScrapedPage> {
  const { html, url } = await fetchHtml(rawUrl, signal);
  return extractContent(html, url);
}

// ---------------------------------------------------------------- fetching

export async function fetchHtml(
  rawUrl: string,
  signal?: AbortSignal,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<{ html: string; url: string }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let url = await assertPublicUrl(rawUrl);
  try {
    // Follow redirects by hand so every hop goes through the SSRF guard.
    for (let hop = 0; ; hop++) {
      let res = await request(url, USER_AGENTS[0], combined);
      if (res.status === 403) {
        await res.body?.cancel();
        res = await request(url, USER_AGENTS[1], combined);
      }

      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        if (hop >= MAX_REDIRECTS)
          throw new ApiError('FETCH_FAILED', 'The page redirected too many times.');
        url = await assertPublicUrl(new URL(location, url).href);
        continue;
      }

      if (!res.ok) {
        await res.body?.cancel();
        throw httpStatusError(res.status);
      }

      const contentType = res.headers.get('content-type') ?? '';
      if (!/^\s*(text\/html|application\/xhtml\+xml)/i.test(contentType)) {
        await res.body?.cancel();
        throw new ApiError(
          'FETCH_FAILED',
          'Only web pages are supported for now, not files like PDFs or images.',
        );
      }

      const bytes = await readUpTo(res, MAX_HTML_BYTES);
      return { html: decode(bytes, contentType), url: url.href };
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (timeout.aborted)
      throw new ApiError('TIMEOUT', 'The site took too long to respond.', { cause: err });
    if (signal?.aborted) throw err; // the client cancelled; let the route ignore it
    throw new ApiError('FETCH_FAILED', "We couldn't reach that site.", { cause: err });
  }
}

function request(url: URL, userAgent: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    redirect: 'manual',
    signal,
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      'accept-language': 'en-US,en;q=0.9',
    },
  });
}

function httpStatusError(status: number): ApiError {
  if (status === 401 || status === 403 || status === 429) {
    return new ApiError('FETCH_FAILED', 'This site blocks automated access.');
  }
  if (status === 404 || status === 410) {
    return new ApiError('FETCH_FAILED', `That page doesn't exist (HTTP ${status}).`);
  }
  return new ApiError('FETCH_FAILED', `The site returned an error (HTTP ${status}).`);
}

/**
 * Reads at most `maxBytes` of the body. Very large pages are cut rather than
 * rejected: the main text is usually near the top, and parsing copes with
 * unfinished HTML.
 */
async function readUpTo(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  if (total >= maxBytes) await reader.cancel();
  return Buffer.concat(chunks).subarray(0, maxBytes);
}

function decode(bytes: Uint8Array, contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes); // unknown charset label
  }
}

// ---------------------------------------------------------------- extraction

export function extractContent(html: string, url: string): ScrapedPage {
  // A silent console: real pages produce lots of CSS parse warnings in jsdom.
  // jsdom does not run the page's scripts unless told to.
  const dom = new JSDOM(html, { url, virtualConsole: new VirtualConsole() });
  const doc = dom.window.document;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const siteName = meta(doc, 'meta[property="og:site_name"]') || hostname;

    // Readability changes the document it reads, so give it a copy.
    const article = new Readability(doc.cloneNode(true) as Document).parse();
    let text = normalise(article?.textContent ?? '');

    if (countWords(text) < MIN_WORDS) {
      const fallback = fallbackText(doc);
      if (countWords(fallback) > countWords(text)) text = fallback;
    }

    const wordCount = countWords(text);
    if (wordCount < MIN_WORDS) {
      throw new ApiError(
        'NO_CONTENT',
        'This page has too little readable text. It may need JavaScript to load its content.',
      );
    }
    return {
      url,
      title:
        article?.title?.trim() ||
        meta(doc, 'meta[property="og:title"]') ||
        doc.title.trim() ||
        siteName,
      // Not Readability's siteName: it often comes from structured data (e.g. "Wikimedia Foundation, Inc.").
      siteName,
      favicon: faviconOf(doc, url),
      text,
      wordCount,
    };
  } finally {
    dom.window.close();
  }
}

function meta(doc: Document, selector: string): string {
  return doc.querySelector<HTMLMetaElement>(selector)?.content?.trim() ?? '';
}

/** Used when Readability finds no article: description + body text without page chrome. */
function fallbackText(doc: Document): string {
  const body = doc.body?.cloneNode(true) as HTMLElement | undefined;
  if (!body) return '';
  body
    .querySelectorAll(
      'script, style, noscript, template, svg, iframe, nav, header, footer, aside, form',
    )
    .forEach((el) => el.remove());
  const description =
    meta(doc, 'meta[name="description"]') || meta(doc, 'meta[property="og:description"]');
  return normalise(`${description}\n${body.textContent ?? ''}`);
}

function faviconOf(doc: Document, pageUrl: string): string | null {
  const href = doc
    .querySelector<HTMLLinkElement>(
      'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
    )
    ?.getAttribute('href');
  try {
    const icon = new URL(href || '/favicon.ico', pageUrl);
    return icon.protocol === 'https:' || icon.protocol === 'http:' ? icon.href : null;
  } catch {
    return null;
  }
}

/** Collapses runs of spaces and blank lines, keeping single line breaks between paragraphs. */
function normalise(text: string): string {
  return text
    .replace(/[ \t\f\v ]+/g, ' ')
    .replace(/ *\n[\s]*/g, '\n')
    .trim();
}
