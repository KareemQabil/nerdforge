/**
 * Deterministic timestamp identifier for session directories.
 * Format: YYYY-MM-DDTHH-MM-SS-mmmZ (no colons, safe for any filesystem).
 */
export function sessionTimestamp(date: Date = new Date()): string {
  const iso = date.toISOString();
  return iso.replace(/:/g, '-').replace(/\./g, '-');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
