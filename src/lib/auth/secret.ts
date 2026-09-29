import { scrypt as scryptCb, randomBytes, timingSafeEqual } from "node:crypto";

export const SCRYPT_KEYLEN = 64;
export const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

/** Hex salt used when the vault does not exist, so unknown ids still pay scrypt cost. */
export const DUMMY_SALT = "00".repeat(16);
/** Hex hash that will not match a real derivation. Same length as a real hash. */
export const DUMMY_HASH = "11".repeat(SCRYPT_KEYLEN);

function mix(secret: string, pepper: string): string {
  return `${pepper}:${secret}`;
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived);
    });
  });
}

/**
 * Hash a device secret. The pepper stays on the server and is mixed into the
 * password so a leaked database cannot be attacked offline without it.
 * Never log `secret`, `pepper`, or the returned hash.
 */
export async function hashSecret(
  secret: string,
  pepper: string,
): Promise<{ secretHash: string; secretSalt: string }> {
  const salt = randomBytes(16);
  const derived = await scrypt(mix(secret, pepper), salt);
  return {
    secretHash: derived.toString("hex"),
    secretSalt: salt.toString("hex"),
  };
}

export async function verifySecret(
  secret: string,
  secretHash: string,
  secretSalt: string,
  pepper: string,
): Promise<boolean> {
  const salt = decodeHex(secretSalt, 16);
  const expected = decodeHex(secretHash, SCRYPT_KEYLEN);
  if (!salt || !expected) return false;
  const derived = await scrypt(mix(secret, pepper), salt);
  return timingSafeEqual(derived, expected);
}

function decodeHex(value: string, byteLength: number): Buffer | null {
  if (typeof value !== "string" || value.length !== byteLength * 2) return null;
  if (!/^[0-9a-f]+$/i.test(value)) return null;
  return Buffer.from(value, "hex");
}
