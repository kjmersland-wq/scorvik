const HASH_ALGORITHM = "pbkdf2-sha256";
const PASSWORD_HASH_ITERATIONS = 600_000;
const PASSWORD_HASH_BITS = 256;
const MIN_PASSWORD_HASH_ITERATIONS = 310_000;
const MAX_PASSWORD_HASH_ITERATIONS = 1_000_000;
const SALT_LENGTH_BYTES = 16;
const textEncoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - base64.length % 4) % 4));
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function derivePasswordBits(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", textEncoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const saltBuffer = new ArrayBuffer(salt.byteLength);
  new Uint8Array(saltBuffer).set(salt);
  return crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: saltBuffer, iterations }, key, PASSWORD_HASH_BITS);
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || textEncoder.encode(password).length > 1024) throw new Error("Password must be between 12 and 1024 bytes.");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  const derived = await derivePasswordBits(password, salt, PASSWORD_HASH_ITERATIONS);
  return `${HASH_ALGORITHM}$${PASSWORD_HASH_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(derived))}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parts = encodedHash.split("$");
  if (parts.length !== 4 || parts[0] !== HASH_ALGORITHM) return false;
  const iterations = Number(parts[1]);
  const salt = fromBase64Url(parts[2]);
  const expected = fromBase64Url(parts[3]);
  if (!Number.isInteger(iterations) || iterations < MIN_PASSWORD_HASH_ITERATIONS || iterations > MAX_PASSWORD_HASH_ITERATIONS) return false;
  if (!salt || salt.length !== SALT_LENGTH_BYTES || !expected || expected.length !== PASSWORD_HASH_BITS / 8) return false;
  if (password.length > 1024 || textEncoder.encode(password).length > 1024) return false;
  const actual = new Uint8Array(await derivePasswordBits(password, salt, iterations));
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index];
  return difference === 0;
}