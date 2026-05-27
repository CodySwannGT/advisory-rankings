import {
  DISCLOSURE_TYPE_MAP,
  SANCTION_MAP,
  STATE_NAME_TO_ABBR,
  WORD_NUMBERS,
} from "./brokercheck-parse-constants.js";

/**
 * Parses money from source data.
 * @param value - Raw value to normalize or parse.
 * @returns The parsed value.
 */
export function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.-]/g, "");
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Parses duration months from source data.
 * @param text - Source text to parse.
 * @returns The parsed value.
 */
export function parseDurationMonths(text?: string | null): number | null {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  const leading = t.split(/\s+/)[0];
  const wordNumber = leading ? WORD_NUMBERS.get(leading) : undefined;
  const months = /^(\d+)\s*month/.exec(t);
  const years = /^(\d+)\s*year/.exec(t);
  const days = /^(\d+)\s*day/.exec(t);

  if (wordNumber != null) return durationByUnit(wordNumber, t);
  if (months) return Number(months[1]);
  if (years) return Number(years[1]) * 12;
  if (days) return Number(days[1]) / 30;
  return null;
}

/**
 * Applies the time unit embedded in BrokerCheck sanction duration text.
 * @param value - Parsed numeric duration.
 * @param text - Lowercase duration text containing the time unit.
 * @returns Duration in months, including fractional months for day values.
 */
function durationByUnit(value: number, text: string): number {
  if (text.includes("year")) return value * 12;
  if (text.includes("day")) return value / 30;
  return value;
}

/**
 * Normalizes disclosure type for consistent comparisons.
 * @param raw - Raw source payload.
 * @returns The normalized value.
 */
export function normalizeDisclosureType(raw = ""): string {
  const key = raw.trim().toLowerCase();
  const mapped = (DISCLOSURE_TYPE_MAP as Readonly<Record<string, string>>)[key];
  return mapped ?? key.replaceAll(" ", "_");
}

/**
 * Normalizes regulator for consistent comparisons.
 * @param raw - Raw source payload.
 * @returns The normalized value.
 */
export function normalizeRegulator(raw = ""): readonly [string, string | null] {
  const r = raw.trim();
  if (!r) return ["", null];
  if (r === "FINRA" || r === "SEC") return [r, null];
  const abbr = (STATE_NAME_TO_ABBR as Readonly<Record<string, string>>)[
    r.toLowerCase()
  ];
  if (abbr) return ["state_securities", abbr];
  return [r, null];
}

/**
 * Normalizes resolution for consistent comparisons.
 * @param raw - Raw source payload.
 * @returns The normalized value.
 */
export function normalizeResolution(
  raw?: string | null
): readonly [string | null, string | null] {
  if (!raw) return [null, null];
  const r = raw.trim();
  const rl = r.toLowerCase();
  if (rl.includes("acceptance, waiver") || rl.includes("awc"))
    return ["final", "neither"];
  if (["settled", "pending", "denied", "withdrawn"].includes(rl))
    return [rl, null];
  if (rl === "order") return ["final", null];
  if (rl === "consent") return ["final", "neither"];
  return [rl.replaceAll(" ", "_") || null, null];
}

/**
 * Normalizes sanction type for consistent comparisons.
 * @param raw - Raw source payload.
 * @returns The normalized value.
 */
export function normalizeSanctionType(raw = ""): string {
  const key = raw.trim().toLowerCase();
  const mapped = (SANCTION_MAP as Readonly<Record<string, string>>)[key];
  return mapped ?? key.replaceAll(" ", "_");
}
