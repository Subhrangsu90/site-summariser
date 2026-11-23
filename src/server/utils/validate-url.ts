import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { ApiError } from './api-error';

/**
 * SSRF guard. The server fetches URLs that users type, so without this anyone
 * could make it request internal addresses such as cloud metadata at
 * 169.254.169.254 or services on localhost.
 */

const blocked = new BlockList();

// IPv4 ranges that are not public internet
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (cloud metadata)
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved + broadcast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}

// IPv6 ranges. IPv4-mapped addresses (::ffff:a.b.c.d) are checked against the IPv4 rules by BlockList.
// NAT64 (64:ff9b::/96) is handled in isBlockedIp: it wraps a real IPv4 address.
for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

const BLOCKED_MESSAGE = "This address can't be summarised.";
const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa'];

export function isBlockedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true; // not an IP at all: refuse rather than guess
  if (family === 4) return blocked.check(ip, 'ipv4');

  // IPv6-only networks with DNS64 return public IPv4 sites as 64:ff9b::<ipv4>.
  // Judge those by the IPv4 address inside, so 64:ff9b::7f00:1 (127.0.0.1) is still blocked.
  const nat64 = nat64ToIpv4(ip);
  if (nat64) return blocked.check(nat64, 'ipv4');
  return blocked.check(ip, 'ipv6');
}

/** Returns the embedded IPv4 address for 64:ff9b::/96, or null for any other IPv6 address. */
export function nat64ToIpv4(ipv6: string): string | null {
  // The URL parser gives the canonical compressed form, e.g. 64:ff9b::22c6:47c9.
  const canonical = new URL(`http://[${ipv6}]`).hostname.slice(1, -1);
  if (!canonical.startsWith('64:ff9b::')) return null;
  const tail = canonical.slice('64:ff9b::'.length).split(':').filter(Boolean);
  if (tail.length > 2) return null;
  const [high, low] = tail.length === 2 ? tail : ['0', tail[0] ?? '0'];
  const value = (Number.parseInt(high, 16) << 16) | Number.parseInt(low, 16);
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join('.');
}

/** Hostname without the brackets that URL keeps around IPv6 literals. */
function hostOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/** Checks that need no network: format, scheme, port, obvious local hosts. */
export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ApiError('INVALID_URL', "That doesn't look like a valid web address.");
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ApiError('INVALID_URL', 'Only http and https links are supported.');
  }
  if (url.username || url.password) {
    throw new ApiError('INVALID_URL', "Links with a username or password aren't supported.");
  }
  // Only default ports: stops the server being used to probe other services.
  if (url.port !== '') {
    throw new ApiError('BLOCKED_URL', BLOCKED_MESSAGE);
  }

  const host = hostOf(url);
  if (host === 'localhost' || BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new ApiError('BLOCKED_URL', BLOCKED_MESSAGE);
  }
  // The URL parser already normalises tricks like http://2130706433 to 127.0.0.1.
  if (isIP(host) && isBlockedIp(host)) {
    throw new ApiError('BLOCKED_URL', BLOCKED_MESSAGE);
  }
  return url;
}

/**
 * Full check: static rules plus a DNS lookup, rejecting the URL if any
 * resolved address is private. Call it again for every redirect hop.
 *
 * Known gap: DNS could return a different address between this lookup and the
 * fetch (DNS rebinding). Pinning the resolved IP in the HTTP agent would close it.
 */
export async function assertPublicUrl(raw: string): Promise<URL> {
  const url = parsePublicUrl(raw);
  const host = hostOf(url);
  if (isIP(host)) return url;

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch (err) {
    throw new ApiError('FETCH_FAILED', `We couldn't find the site "${host}". Check the address.`, { cause: err });
  }
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) {
    throw new ApiError('BLOCKED_URL', BLOCKED_MESSAGE);
  }
  return url;
}
