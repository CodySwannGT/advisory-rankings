/**
 * Display-label formatter shared by the search dropdown, event cards, and
 * any other surface that renders a machine-style label as human-readable
 * text. Lives in its own module so consumers can import it without pulling
 * in the rest of the search organism (and to keep that organism within
 * `max-lines`).
 */

const PLACEHOLDER_LABELS: ReadonlySet<string> = new Set([
  "unknown",
  "n/a",
  "na",
  "none",
  "null",
  "undefined",
]);

const ACRONYMS: Readonly<Record<string, string>> = {
  uhnw: "UHNW",
  ria: "RIA",
  bd: "BD",
  finra: "FINRA",
  sec: "SEC",
};

/**
 * Preserves finance acronyms while title-casing ordinary words.
 * @param word - Lowercase token from a machine label.
 * @returns Display token.
 */
function formatWord(word: string): string {
  return ACRONYMS[word] ?? word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * Converts machine labels into compact human-readable labels for search rows.
 * @param value - Raw value from a search result or article category.
 * @returns Display label, or null for empty placeholder values.
 */
export function formatInlineLabel(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (!text || PLACEHOLDER_LABELS.has(text.toLowerCase())) return null;
  return text
    .replace(/_+/g, " ")
    .toLowerCase()
    .split(" ")
    .map(formatWord)
    .join(" ");
}
