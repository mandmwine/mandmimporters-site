// Share-link password hashing. Uses scryptSync — Node built-in, no new dep.
//
// Format of the stored hash:   scrypt$N14r8p1$<salt-b64>$<hash-b64>
// N14 = cost 2**14, r=8, p=1 — comfortable for a password behind an opaque
// 32-char token, since brute force already has to guess the token first.
//
// On verify we recompute the hash with the stored salt and timing-safe compare.
import crypto from "node:crypto";

const COST = 1 << 14;
const BLOCK = 8;
const PARALLEL = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

export function hashSharePassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, {
    N: COST, r: BLOCK, p: PARALLEL, maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$N14r8p1$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifySharePassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "scrypt") return false;
  try {
    const salt = Buffer.from(parts[2], "base64url");
    const expected = Buffer.from(parts[3], "base64url");
    const got = crypto.scryptSync(password, salt, expected.length, {
      N: COST, r: BLOCK, p: PARALLEL, maxmem: 64 * 1024 * 1024,
    });
    if (got.length !== expected.length) return false;
    return crypto.timingSafeEqual(got, expected);
  } catch {
    return false;
  }
}

// A deterministic cookie name per share token so clearing one share doesn't
// clear every other share's unlock status.
export function unlockCookieName(token: string): string {
  // Keep it short and cookie-safe.
  return `mm_share_${token.replace(/[^A-Za-z0-9]/g, "").slice(0, 24)}`;
}

// The unlock cookie value is a SHA256 of (token + password_hash) truncated.
// A changed password rotates the hash and invalidates every outstanding
// unlock cookie for this share, so a revoked recipient really is kicked.
export function unlockCookieValue(token: string, passwordHash: string): string {
  return crypto
    .createHash("sha256")
    .update(token + ":" + passwordHash)
    .digest("base64url")
    .slice(0, 32);
}
