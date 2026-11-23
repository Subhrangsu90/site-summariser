import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// No real DNS in tests: the guard itself is covered in validate-url.spec.ts.
const assertPublicUrl = vi.fn(async (url: string) => new URL(url));
vi.mock('../utils/validate-url', () => ({ assertPublicUrl: (url: string) => assertPublicUrl(url) }));

const { extractContent, fetchHtml, scrapePage } = await import('./scraper.service');

const ARTICLE_TEXT = Array.from(
  { length: 40 },
  (_, i) => `Paragraph ${i + 1} explains how lighthouses guided ships along dangerous coasts at night.`,
).join(' ');

const ARTICLE_HTML = `<!doctype html><html><head>
  <title>Lighthouses | Sea Stories</title>
  <meta property="og:site_name" content="Sea Stories">
  <link rel="icon" href="/icon.png">
</head><body>
  <nav>Home · About · Contact</nav>
  <article><h1>Lighthouses</h1><p>${ARTICLE_TEXT}</p></article>
  <footer>© Sea Stories</footer>
</body></html>`;

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  assertPublicUrl.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('scrapePage', () => {
  it('extracts the article text, title, site name and favicon', async () => {
    fetchMock.mockResolvedValue(htmlResponse(ARTICLE_HTML));
    const page = await scrapePage('https://sea.example/lighthouses');

    expect(page.siteName).toBe('Sea Stories');
    expect(page.title).toContain('Lighthouses');
    expect(page.favicon).toBe('https://sea.example/icon.png');
    expect(page.text).toContain('Paragraph 40 explains');
    expect(page.text).not.toContain('Home · About'); // navigation removed
    expect(page.wordCount).toBeGreaterThan(200);
  });

  it('rejects pages that are not HTML', async () => {
    fetchMock.mockResolvedValue(new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } }));
    await expect(scrapePage('https://sea.example/file.pdf')).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: expect.stringContaining('Only web pages'),
    });
  });

  it('explains 404 and bot-blocking responses', async () => {
    fetchMock.mockResolvedValue(htmlResponse('Not found', { status: 404 }));
    await expect(fetchHtml('https://sea.example/missing')).rejects.toMatchObject({
      message: expect.stringContaining('404'),
    });

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(htmlResponse('Too many requests', { status: 429 }));
    await expect(fetchHtml('https://sea.example/busy')).rejects.toMatchObject({
      message: 'This site blocks automated access.',
    });
  });

  it('retries a 403 once with the second User-Agent', async () => {
    fetchMock.mockResolvedValueOnce(htmlResponse('Forbidden', { status: 403 }));
    fetchMock.mockResolvedValueOnce(htmlResponse(ARTICLE_HTML));

    await expect(fetchHtml('https://sea.example/a')).resolves.toMatchObject({ url: 'https://sea.example/a' });
    const agents = fetchMock.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)['user-agent']);
    expect(agents).toHaveLength(2);
    expect(agents[0]).not.toBe(agents[1]);
  });

  it('runs every redirect hop through the SSRF guard', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: 'https://www.sea.example/a' } }));
    fetchMock.mockResolvedValueOnce(htmlResponse(ARTICLE_HTML));

    const { url } = await fetchHtml('http://sea.example/a');
    expect(url).toBe('https://www.sea.example/a');
    expect(assertPublicUrl.mock.calls.map(([u]) => u)).toEqual(['http://sea.example/a', 'https://www.sea.example/a']);
  });

  it('times out slow sites with TIMEOUT', async () => {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))),
    );
    await expect(fetchHtml('https://slow.example', undefined, 50)).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('extractContent', () => {
  it('reports pages with too little text as NO_CONTENT', () => {
    const shell = '<html><head><title>App</title></head><body><div id="root"></div><script>boot()</script></body></html>';
    expect(() => extractContent(shell, 'https://spa.example')).toThrow(expect.objectContaining({ code: 'NO_CONTENT' }));
  });
});
