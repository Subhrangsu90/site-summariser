import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookup = vi.fn();
vi.mock('node:dns/promises', () => ({
  // The vi.fn returns plain values (an Error means "DNS failed") and the throw
  // happens here: Vitest's mock tracking otherwise reports a rejection from a
  // vi.fn as a test failure even when the code under test handles it.
  lookup: async (...args: unknown[]) => {
    const result = await lookup(...args);
    if (result instanceof Error) throw result;
    return result;
  },
}));

const { assertPublicUrl, isBlockedIp, nat64ToIpv4, parsePublicUrl } = await import('./validate-url');

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('parsePublicUrl (no network)', () => {
  it('accepts public http and https URLs', () => {
    expect(parsePublicUrl('https://example.com/article?id=1').href).toBe('https://example.com/article?id=1');
    expect(parsePublicUrl('  http://en.wikipedia.org/wiki/Lighthouse ').hostname).toBe('en.wikipedia.org');
  });

  it.each([
    ['ftp://example.com', 'INVALID_URL'],
    ['not a url', 'INVALID_URL'],
    ['javascript:alert(1)', 'INVALID_URL'],
    ['http://user:pw@example.com', 'INVALID_URL'],
    ['https://example.com:8080', 'BLOCKED_URL'],
    ['http://localhost', 'BLOCKED_URL'],
    ['http://app.localhost', 'BLOCKED_URL'],
    ['http://printer.local', 'BLOCKED_URL'],
    ['http://127.0.0.1', 'BLOCKED_URL'],
    ['http://2130706433', 'BLOCKED_URL'], // 127.0.0.1 as a decimal number
    ['http://0x7f.1', 'BLOCKED_URL'], // 127.0.0.1 in hex shorthand
    ['http://10.0.0.5', 'BLOCKED_URL'],
    ['http://172.16.4.1', 'BLOCKED_URL'],
    ['http://192.168.1.1', 'BLOCKED_URL'],
    ['http://169.254.169.254/latest/meta-data', 'BLOCKED_URL'], // cloud metadata
    ['http://0.0.0.0', 'BLOCKED_URL'],
    ['http://[::1]/', 'BLOCKED_URL'],
    ['http://[::ffff:127.0.0.1]/', 'BLOCKED_URL'],
    ['http://[64:ff9b::7f00:1]/', 'BLOCKED_URL'], // NAT64-wrapped 127.0.0.1
    ['http://[fd00::1]/', 'BLOCKED_URL'],
  ])('rejects %s with %s', (url, code) => {
    expect(codeOf(() => parsePublicUrl(url))).toBe(code);
  });
});

describe('isBlockedIp / nat64ToIpv4', () => {
  it('allows public addresses', () => {
    expect(isBlockedIp('8.8.8.8')).toBe(false);
    expect(isBlockedIp('2606:4700::1111')).toBe(false);
  });

  it('judges NAT64 addresses by the IPv4 address inside', () => {
    expect(nat64ToIpv4('64:ff9b::22c6:47c9')).toBe('34.198.71.201');
    expect(nat64ToIpv4('64:ff9b::a9fe:a9fe')).toBe('169.254.169.254');
    expect(nat64ToIpv4('2606:4700::1111')).toBeNull();
    expect(isBlockedIp('64:ff9b::22c6:47c9')).toBe(false); // public site on an IPv6-only network
    expect(isBlockedIp('64:ff9b::a9fe:a9fe')).toBe(true); // metadata address, wrapped
  });

  it('refuses anything that is not an IP', () => {
    expect(isBlockedIp('example.com')).toBe(true);
  });
});

describe('assertPublicUrl (with DNS)', () => {
  beforeEach(() => lookup.mockReset());

  it('passes when every resolved address is public', async () => {
    lookup.mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
    await expect(assertPublicUrl('https://example.com')).resolves.toBeInstanceOf(URL);
  });

  it('blocks a public name that resolves to a private address', async () => {
    lookup.mockResolvedValue([
      { address: '93.184.215.14', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ]);
    await expect(assertPublicUrl('https://localtest.me')).rejects.toMatchObject({ code: 'BLOCKED_URL' });
  });

  it('reports a name that does not resolve as FETCH_FAILED', async () => {
    lookup.mockReturnValue(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }));
    await expect(assertPublicUrl('https://no-such-site.example')).rejects.toMatchObject({
      code: 'FETCH_FAILED',
      message: expect.stringContaining('no-such-site.example'),
    });
  });

  it('does not look up IP literals', async () => {
    await expect(assertPublicUrl('https://8.8.8.8/')).resolves.toBeInstanceOf(URL);
    expect(lookup).not.toHaveBeenCalled();
  });
});
