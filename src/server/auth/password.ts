import { hash, verify } from "argon2";

/** Hostinger-safe Argon2id settings (default memory can OOM shared Node plans). */
const HASH_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
} as const;

export function hashPassword(password: string) {
  return hash(password, HASH_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string) {
  return verify(passwordHash, password);
}
