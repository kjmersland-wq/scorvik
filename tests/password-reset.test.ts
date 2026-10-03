import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { authenticatePreviewUser, isPreviewSessionCurrent } from "../src/lib/auth/auth-service.ts";
import type { AuthCredential, AuthStore } from "../src/lib/auth/d1-store.ts";
import type { PasswordResetEmail, PasswordResetEmailProvider } from "../src/lib/auth/email-provider.ts";
import { MemoryAuthStore } from "../src/lib/auth/memory-store.ts";
import { hashPassword } from "../src/lib/auth/password-hash.ts";
import {
  applyPreviewPasswordReset,
  PASSWORD_RESET_REQUEST_MESSAGE,
  PASSWORD_RESET_TOKEN_TTL_MS,
  requestPreviewPasswordReset,
} from "../src/lib/auth/password-reset-service.ts";
import { createResetToken, hashResetToken } from "../src/lib/auth/reset-token.ts";
import { createPreviewSessionToken, getPreviewSessionClaims } from "../src/lib/auth/session-core.ts";

const email = "preview@example.test";
const bootstrapPassword = `Bootstrap-${randomBytes(24).toString("base64url")}`;
const newPassword = `Changed-${randomBytes(24).toString("base64url")}`;
const secret = randomBytes(32).toString("base64url");
const environment = { SCORVIK_PREVIEW_EMAIL: email, SCORVIK_PREVIEW_PASSWORD: bootstrapPassword, SCORVIK_AUTH_SECRET: secret };
const origin = "http://localhost:3000";

class RecordingStore implements AuthStore {
  readonly memory = new MemoryAuthStore();
  lastTokenHash: string | null = null;

  getCredential(emailAddress: string): Promise<AuthCredential | null> {
    return this.memory.getCredential(emailAddress);
  }

  consumeRateLimit(bucket: string, now: number, windowMs: number, maxAttempts: number): Promise<boolean> {
    return this.memory.consumeRateLimit(bucket, now, windowMs, maxAttempts);
  }

  async createResetToken(id: string, emailAddress: string, tokenHash: string, createdAt: number, expiresAt: number): Promise<void> {
    this.lastTokenHash = tokenHash;
    await this.memory.createResetToken(id, emailAddress, tokenHash, createdAt, expiresAt);
  }

  isResetTokenUsable(emailAddress: string, tokenHash: string, now: number): Promise<boolean> {
    return this.memory.isResetTokenUsable(emailAddress, tokenHash, now);
  }

  consumeResetToken(emailAddress: string, tokenHash: string, passwordHash: string, now: number): Promise<boolean> {
    return this.memory.consumeResetToken(emailAddress, tokenHash, passwordHash, now);
  }
}

function resetRequest(store: AuthStore, requestedEmail: string, now: number, nodeEnv: string, emailProvider: PasswordResetEmailProvider | null = null) {
  return requestPreviewPasswordReset({
    email: requestedEmail,
    clientAddress: "127.0.0.1",
    origin,
    store,
    emailProvider,
    environment: { ...environment, NODE_ENV: nodeEnv },
    now,
  });
}

test("bootstrap login works until a D1 password hash exists; then the hash takes precedence", async () => {
  const store = new MemoryAuthStore();
  const bootstrap = await authenticatePreviewUser(email, bootstrapPassword, store, environment);
  assert.deepEqual(bootstrap, { email, sessionVersion: 0 });
  assert.equal(await authenticatePreviewUser(email, "wrong-password-value", store, environment), null);

  const { token, tokenHash } = await createResetToken();
  const now = Date.now();
  await store.createResetToken("seed-credential", email, tokenHash, now, now + PASSWORD_RESET_TOKEN_TTL_MS);
  const passwordHash = await hashPassword(newPassword);
  await store.consumeResetToken(email, await hashResetToken(token), passwordHash, now + 1);
  const stored = await store.getCredential(email);
  assert.ok(stored);
  assert.equal(stored.password_hash.includes(newPassword), false);
  assert.equal(await authenticatePreviewUser(email, bootstrapPassword, store, environment), null);
  assert.deepEqual(await authenticatePreviewUser(email, newPassword, store, environment), { email, sessionVersion: 1 });
});

test("reset links use random tokens and only the token hash is stored", async () => {
  const store = new RecordingStore();
  const first = await createResetToken();
  const second = await createResetToken();
  assert.notEqual(first.token, second.token);
  assert.equal(first.token.length, 43);
  assert.equal(first.tokenHash, await hashResetToken(first.token));

  const result = await resetRequest(store, email, Date.now(), "development");
  assert.ok(result.developmentResetUrl);
  const token = new URL(result.developmentResetUrl!).searchParams.get("token");
  assert.ok(token);
  assert.equal(store.lastTokenHash, await hashResetToken(token));
  assert.notEqual(store.lastTokenHash, token);
  assert.equal(await store.isResetTokenUsable(email, store.lastTokenHash!, Date.now()), true);
});

test("production response does not enumerate addresses or surface a token without email delivery", async () => {
  const knownStore = new RecordingStore();
  const unknownStore = new RecordingStore();
  const known = await resetRequest(knownStore, email, Date.now(), "production");
  const unknown = await resetRequest(unknownStore, "nobody@example.test", Date.now(), "production");

  assert.equal(known.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.equal(unknown.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.equal(known.developmentResetUrl, undefined);
  assert.equal(unknown.developmentResetUrl, undefined);
  assert.equal(knownStore.lastTokenHash, null);
  assert.equal(unknownStore.lastTokenHash, null);
});

test("an email provider receives a reset URL without changing the neutral response", async () => {
  const store = new RecordingStore();
  let sentEmail: string | undefined;
  let sentUrl: string | undefined;
  const provider: PasswordResetEmailProvider = {
    async sendPasswordResetEmail(message: PasswordResetEmail) {
      sentEmail = message.email;
      sentUrl = message.resetUrl;
    },
  };
  const result = await resetRequest(store, email, Date.now(), "production", provider);
  assert.equal(result.message, PASSWORD_RESET_REQUEST_MESSAGE);
  assert.equal(result.developmentResetUrl, undefined);
  assert.equal(sentEmail, email);
  assert.match(sentUrl ?? "", /^http:\/\/localhost:3000\/reset-password\?token=/);
  const token = new URL(sentUrl!).searchParams.get("token")!;
  assert.equal(store.lastTokenHash, await hashResetToken(token));
  assert.notEqual(store.lastTokenHash, token);
});

test("provider-enabled reset responses remain identical for known and unknown emails", async () => {
  const knownStore = new RecordingStore();
  const unknownStore = new RecordingStore();
  const scheduled: Array<{ email: string; resetUrl: string; expiresAt: number } | null> = [];
  const provider: PasswordResetEmailProvider = { async sendPasswordResetEmail(message: PasswordResetEmail) { assert.ok(message.resetUrl); } };
  const dispatchEmail = async (_provider: PasswordResetEmailProvider, message: PasswordResetEmail | null) => {
    scheduled.push(message);
  };
  const known = await requestPreviewPasswordReset({
    email,
    clientAddress: "127.0.0.1",
    origin,
    store: knownStore,
    emailProvider: provider,
    dispatchEmail,
    environment: { ...environment, NODE_ENV: "production" },
  });
  const unknown = await requestPreviewPasswordReset({
    email: "nobody@example.test",
    clientAddress: "127.0.0.1",
    origin,
    store: unknownStore,
    emailProvider: provider,
    dispatchEmail,
    environment: { ...environment, NODE_ENV: "production" },
  });

  assert.equal(known.message, unknown.message);
  assert.equal(known.developmentResetUrl, undefined);
  assert.equal(unknown.developmentResetUrl, undefined);
  assert.ok(scheduled[0]?.resetUrl.includes("/reset-password?token="));
  assert.equal(scheduled[1], null);
});

test("expired, malformed, mismatched, and reused reset tokens cannot change a password", async () => {
  const store = new RecordingStore();
  const now = 1_700_000_000_000;
  const expired = await resetRequest(store, email, now, "development");
  const expiredToken = new URL(expired.developmentResetUrl!).searchParams.get("token")!;
  assert.equal(await applyPreviewPasswordReset({ token: expiredToken, password: newPassword, confirmation: newPassword, clientAddress: "local", store, email, environment, now: now + PASSWORD_RESET_TOKEN_TTL_MS }), false);
  assert.equal(await applyPreviewPasswordReset({ token: "invalid", password: newPassword, confirmation: newPassword, clientAddress: "local", store, email, environment, now }), false);
  assert.equal(await applyPreviewPasswordReset({ token: expiredToken, password: newPassword, confirmation: "different-password", clientAddress: "local", store, email, environment, now }), false);
  assert.equal(await applyPreviewPasswordReset({ token: expiredToken, password: "too-short", confirmation: "too-short", clientAddress: "local", store, email, environment, now }), false);
  assert.equal(await store.getCredential(email), null);
});

test("successful reset stores a hash, invalidates old sessions and bootstrap login, and allows the new password once", async () => {
  const store = new RecordingStore();
  const now = 1_700_000_000_000;
  const bootstrapUser = await authenticatePreviewUser(email, bootstrapPassword, store, environment);
  assert.ok(bootstrapUser);
  const oldToken = await createPreviewSessionToken(secret, bootstrapUser.sessionVersion, now);
  const oldClaims = await getPreviewSessionClaims(oldToken, secret, now);
  assert.ok(oldClaims);
  assert.equal(await isPreviewSessionCurrent(oldClaims, store, email), true);

  const request = await resetRequest(store, email, now, "development");
  const token = new URL(request.developmentResetUrl!).searchParams.get("token")!;
  const changed = await applyPreviewPasswordReset({ token, password: newPassword, confirmation: newPassword, clientAddress: "local", store, email, environment, now: now + 1 });
  assert.equal(changed, true);

  const credential = await store.getCredential(email);
  assert.ok(credential);
  assert.equal(credential.password_hash.includes(newPassword), false);
  assert.equal(await authenticatePreviewUser(email, bootstrapPassword, store, environment), null);
  const newUser = await authenticatePreviewUser(email, newPassword, store, environment);
  assert.deepEqual(newUser, { email, sessionVersion: 1 });
  assert.equal(await isPreviewSessionCurrent(oldClaims, store, email), false);

  const newToken = await createPreviewSessionToken(secret, newUser!.sessionVersion, now + 2);
  const newClaims = await getPreviewSessionClaims(newToken, secret, now + 2);
  assert.ok(newClaims);
  assert.equal(await isPreviewSessionCurrent(newClaims, store, email), true);
  assert.equal(await applyPreviewPasswordReset({ token, password: newPassword, confirmation: newPassword, clientAddress: "local", store, email, environment, now: now + 3 }), false);
});
