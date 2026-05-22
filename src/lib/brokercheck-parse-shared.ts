/**
 * Converts BrokerCheck date strings to ISO yyyy-mm-dd dates.
 * @param value - Raw date value from BrokerCheck.
 * @returns ISO date when the source value is parseable.
 */
export function toIsoDate(value?: string | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parts = s.split("/");
  if (parts.length === 3) {
    const [mm, dd, yyyy] = parts.map(Number);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (
      d.getUTCFullYear() === yyyy &&
      d.getUTCMonth() === mm - 1 &&
      d.getUTCDate() === dd
    ) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

/**
 * Title-cases BrokerCheck display-name fragments.
 * @param value - Raw name fragment.
 * @returns Title-cased text, or null for blank input.
 */
export function title(value?: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
