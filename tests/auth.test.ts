import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import {
  createPreviewSessionToken,
  hasPreviewCredentials,
  isPreviewSessionTokenValid,
  OWNER_PASSWORD_SESSION_VERSION,
  previewCredentialsMatch,
  PREVIEW_SESSION_MAX_AGE_SECONDS,
  previewSessionCookieOptions,
  previewPasswordMatches,
  requiresPreviewAuthentication,
} from "../src/lib/auth/session-core.ts";

const email = `${randomBytes(12).toString("hex")}@example.test`;
const password = randomBytes(32).toString("base64url");
const secret = randomBytes(32).toString("base64url");
const environment = {
  SCORVIK_PREVIEW_EMAIL: email,
  SCORVIK_PREVIEW_PASSWORD: password,
  SCORVIK_AUTH_SECRET: secret,
};

test("preview credentials compare without accepting incomplete configuration", async () => {
  assert.equal(hasPreviewCredentials(environment), true);
  assert.equal(await previewCredentialsMatch(email.toUpperCase(), password, environment), true);
  assert.equal(await previewCredentialsMatch(email, `${password}x`, environment), false);
  assert.equal(await previewCredentialsMatch("other@example.test", password, environment), false);
  assert.equal(await previewCredentialsMatch(email, password, {}), false);
  assert.equal(hasPreviewCredentials({ ...environment, SCORVIK_AUTH_SECRET: "short" }), false);
});

test("signed sessions expire and reject tampering or a different secret", async () => {
  const now = 1_700_000_000_000;
  const token = await createPreviewSessionToken(secret, 0, now);
  assert.equal(await isPreviewSessionTokenValid(token, secret, now), true);
  assert.equal(await isPreviewSessionTokenValid(await createPreviewSessionToken(secret, 4, now), secret, now), true);
  assert.equal(await isPreviewSessionTokenValid(token, secret, now + PREVIEW_SESSION_MAX_AGE_SECONDS * 1000), false);
  assert.equal(await isPreviewSessionTokenValid(`${token}x`, secret, now), false);
  assert.equal(await isPreviewSessionTokenValid(token, randomBytes(32).toString("base64url"), now), false);
  assert.equal(await isPreviewSessionTokenValid(token, undefined, now), false);
  assert.equal(await isPreviewSessionTokenValid(await createPreviewSessionToken(secret, OWNER_PASSWORD_SESSION_VERSION, now), secret, now), true);
  await assert.rejects(createPreviewSessionToken("short", now));
});

test("the cookie is HTTP-only, same-site, scoped to the host, and secure in production", () => {
  assert.deepEqual(previewSessionCookieOptions(false), {
    httpOnly: true,
    secure: false,
    sameSite: "lax",
    path: "/",
    maxAge: PREVIEW_SESSION_MAX_AGE_SECONDS,
    priority: "high",
  });
  assert.equal(previewSessionCookieOptions(true).secure, true);
});

test("all public content pages require the password box while login, API and assets pass through", () => {
  for (const path of ["/", "/create", "/projects", "/projects/example-id", "/account/security", "/api", "/api/website/analyze", "/pricing", "/how-it-works", "/no", "/no/create", "/no/projects", "/no/pricing", "/no/how-it-works", "/anything-else"]) {
    assert.equal(requiresPreviewAuthentication(path), path.startsWith("/api") ? false : true, path);
  }
  for (const path of ["/login", "/_next/static/chunks/app.js", "/_next/image/logo.png", "/favicon.ico", "/images/logo.svg", "/music/warm-104-ad.mp3"]) {
    assert.equal(requiresPreviewAuthentication(path), false, path);
  }
});

test("anonymous preview password compares safely without requiring an email", async () => {
  assert.equal(await previewPasswordMatches(password, environment), true);
  assert.equal(await previewPasswordMatches(`${password}x`, environment), false);
  assert.equal(await previewPasswordMatches(password, { SCORVIK_PREVIEW_PASSWORD: password }), false);
});