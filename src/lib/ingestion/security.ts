import { isIP } from "node:net";
import { lookup } from "node:dns/promises";

export type IngestionErrorCode = "INVALID_URL" | "BLOCKED_URL" | "DNS_FAILED" | "TIMEOUT" | "UNAVAILABLE" | "ACCESS_DENIED" | "UNSUPPORTED_CONTENT" | "RESPONSE_TOO_LARGE" | "EMPTY_PAGE";

export class WebsiteIngestionError extends Error {
  readonly code: IngestionErrorCode;

  constructor(code: IngestionErrorCode, message: string) {
    super(message);
    this.name = "WebsiteIngestionError";
    this.code = code;
  }
}

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;

const forbiddenHostnameSuffixes = [".localhost", ".local", ".internal", ".home", ".lan", ".test", ".invalid"];

function ipv4Number(address: string): number | null {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
  return parts.reduce((result, part) => ((result << 8) | Number(part)) >>> 0, 0);
}

function inIpv4Range(address: number, base: number, prefix: number): boolean {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (base & mask);
}

function parseIpv6(address: string): bigint | null {
  let value = address.toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const ipv4 = ipv4Number(value.slice(lastColon + 1));
    if (ipv4 === null) return null;
    value = `${value.slice(0, lastColon)}:${((ipv4 >>> 16) & 0xffff).toString(16)}:${(ipv4 & 0xffff).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((part) => !/^[\da-f]{1,4}$/.test(part))) return null;
  const gap = 8 - left.length - right.length;
  if ((halves.length === 1 && gap !== 0) || (halves.length === 2 && gap < 1)) return null;
  const groups = [...left, ...Array.from({ length: gap }, () => "0"), ...right];
  return groups.reduce((result, group) => (result << 16n) | BigInt(`0x${group || "0"}`), 0n);
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    if (value === null) return false;
    const blockedRanges: Array<[string, number]> = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
    ];
    return !blockedRanges.some(([base, prefix]) => inIpv4Range(value, ipv4Number(base)!, prefix));
  }
  if (family !== 6) return false;
  const value = parseIpv6(address);
  if (value === null) return false;
  const mappedPrefix = value >> 32n;
  if ((mappedPrefix >> 32n) === 0n && (mappedPrefix & 0xffffn) === 0xffffn) {
    return isPublicAddress(`${Number((value >> 24n) & 255n)}.${Number((value >> 16n) & 255n)}.${Number((value >> 8n) & 255n)}.${Number(value & 255n)}`);
  }
  const globalUnicast = (value >> 125n) === 0b001n;
  const documentation = (value >> 96n) === 0x20010db8n;
  const orchid = (value >> 100n) === 0x20010n;
  return globalUnicast && !documentation && !orchid;
}

export function normalizeWebsiteUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 2048 || /[\u0000-\u0020\\]/.test(trimmed)) {
    throw new WebsiteIngestionError("INVALID_URL", "Enter a valid public website URL.");
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new WebsiteIngestionError("INVALID_URL", "Enter a valid public website URL.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || !url.hostname) {
    throw new WebsiteIngestionError("INVALID_URL", "Only public HTTP and HTTPS pages can be analyzed.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  const family = isIP(hostname);
  if (!family && (!hostname.includes(".") || forbiddenHostnameSuffixes.some((suffix) => hostname.endsWith(suffix)))) {
    throw new WebsiteIngestionError("BLOCKED_URL", "This address is not publicly accessible.");
  }
  if (family && !isPublicAddress(hostname)) {
    throw new WebsiteIngestionError("BLOCKED_URL", "This address is not publicly accessible.");
  }
  url.hash = "";
  return url;
}

export async function resolvePublicAddress(hostname: string, resolver: AddressResolver = async (name) => {
  const addresses = await lookup(name, { all: true, verbatim: true });
  return addresses.map(({ address, family }) => ({ address, family: family as 4 | 6 }));
}) {
  const plainHostname = hostname.replace(/^\[|\]$/g, "");
  if (isIP(plainHostname)) {
    if (!isPublicAddress(plainHostname)) throw new WebsiteIngestionError("BLOCKED_URL", "This address is not publicly accessible.");
    return { address: plainHostname, family: isIP(plainHostname) as 4 | 6 };
  }
  let addresses: ResolvedAddress[];
  try {
    addresses = await resolver(plainHostname);
  } catch {
    throw new WebsiteIngestionError("DNS_FAILED", "We couldn't find this website.");
  }
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new WebsiteIngestionError("BLOCKED_URL", "This address is not publicly accessible.");
  }
  return addresses[0];
}
