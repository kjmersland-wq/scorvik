import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, verifyPassword } from "../src/lib/auth/password-hash.ts";

test("password hashes are salted, non-plaintext PBKDF2 values and verify correctly", async () => {
  const password = "Correct-Horse-Preview-Password";
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.match(firstHash, /^pbkdf2-sha256\$600000\$/);
  assert.notEqual(firstHash, secondHash);
  assert.equal(firstHash.includes(password), false);
  assert.equal(await verifyPassword(password, firstHash), true);
  assert.equal(await verifyPassword("a different password", firstHash), false);
  assert.equal(await verifyPassword(password, "not-a-hash"), false);
});

test("password hashing enforces the reset form's minimum length and storage bound", async () => {
  await assert.rejects(hashPassword("too short"));
  await assert.rejects(hashPassword("x".repeat(1025)));
});