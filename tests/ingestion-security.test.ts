import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAddress, normalizeWebsiteUrl, resolvePublicAddress, WebsiteIngestionError } from "../src/lib/ingestion/security.ts";
import { fetchWebsiteHtml } from "../src/lib/ingestion/fetch-html.ts";

test("accepts ordinary public website URLs and normalizes bare domains", () => {
  assert.equal(normalizeWebsiteUrl("example.com/path#section").href, "https://example.com/path");
  assert.equal(normalizeWebsiteUrl("http://example.com").protocol, "http:");
});

test("rejects malformed URLs, credentials, unsafe protocols, and internal hostnames", () => {
  for (const value of ["", "not a url", "file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "data:text/html,hi", "http://user:pass@example.com", "http://printer", "http://metadata.google.internal"]) {
    assert.throws(() => normalizeWebsiteUrl(value), WebsiteIngestionError, value);
  }
});

test("rejects private, loopback, link-local, reserved and mapped private IPs", () => {
  for (const address of ["0.0.0.0", "10.2.3.4", "100.64.0.1", "127.0.0.1", "169.254.169.254", "172.20.0.1", "192.168.1.1", "198.18.0.1", "224.0.0.1", "::", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("93.184.216.34"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});

test("rejects a hostname whose DNS answers include any private destination", async () => {
  await assert.rejects(
    resolvePublicAddress("example.com", async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ]),
    { code: "BLOCKED_URL" },
  );
});

test("pins the selected address from a public DNS answer", async () => {
  const address = await resolvePublicAddress("example.com", async () => [{ address: "93.184.216.34", family: 4 }]);
  assert.deepEqual(address, { address: "93.184.216.34", family: 4 });
});

test("applies a hard timeout when DNS or a response stalls", async () => {
  await assert.rejects(
    fetchWebsiteHtml("https://public.example", {
      timeoutMs: 10,
      resolver: async () => [{ address: "93.184.216.34", family: 4 }],
      request: async () => new Promise(() => {}),
    }),
    { code: "TIMEOUT" },
  );
});
