// Prism (OpenAI) closes on 2027-01-01; the landing counts the days down.
export const PRISM_CLOSES = Date.UTC(2027, 0, 1);

/** Whole days left until Prism closes (0 once it has closed). */
export function daysUntilPrismCloses(now: number = Date.now()): number {
  return Math.max(0, Math.ceil((PRISM_CLOSES - now) / 86_400_000));
}
