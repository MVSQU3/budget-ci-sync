const MIN_PEPPER_LENGTH = 16;

/** Server pepper mixed into scrypt. Returns null when it is missing or too short. */
export function readPepper(): string | null {
  const pepper = process.env.SYNC_PEPPER;
  if (!pepper || pepper.length < MIN_PEPPER_LENGTH) return null;
  return pepper;
}
