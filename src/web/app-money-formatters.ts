/** Optional compaction flag for {@link fmtMoney}. */
export interface FmtMoneyOptions {
  readonly compact?: boolean;
}

/**
 * Formats a number as USD, optionally using K/M/B suffixes.
 * @param n - Raw numeric value, or null/undefined for "—".
 * @param options - Formatting options.
 * @param options.compact - When true (the default), large numbers
 *                          collapse to K/M/B suffixes.
 * @returns Display string suitable for direct DOM insertion.
 */
export function fmtMoney(
  n: number | null | undefined,
  { compact = true }: FmtMoneyOptions = {}
): string {
  if (n == null) return "—";
  const compactLabel = compact ? compactMoneyLabel(n) : null;
  return compactLabel ?? `$${Math.round(n).toLocaleString()}`;
}

/**
 *
 * @param n
 */
/**
 * Formats a compact K/M/B money suffix when the value is large enough.
 * @param value - Numeric money value.
 * @returns Compact money label or null for small values.
 */
function compactMoneyLabel(value: number): string | null {
  const absoluteValue = Math.abs(value);
  if (absoluteValue >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (absoluteValue >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (absoluteValue >= 1e3) return `$${(value / 1e3).toFixed(0)}K`;
  return null;
}
