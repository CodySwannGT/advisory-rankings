/**
 * Converts machine labels into compact human-readable labels for search rows.
 * @param value - Raw value from a search result or article category.
 * @returns Display label, or null for empty placeholder values.
 */
export function formatInlineLabel(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (
    !text ||
    ["unknown", "n/a", "na", "none", "null", "undefined"].includes(
      text.toLowerCase()
    )
  )
    return null;
  return text
    .replace(/_+/g, " ")
    .toLowerCase()
    .split(" ")
    .map(formatWord)
    .join(" ");
}

/**
 * Preserves finance acronyms while title-casing ordinary words.
 * @param word - Lowercase token from a machine label.
 * @returns Display token.
 */
function formatWord(word: string): string {
  return (
    { uhnw: "UHNW", ria: "RIA", bd: "BD", finra: "FINRA", sec: "SEC" }[word] ??
    word.charAt(0).toUpperCase() + word.slice(1)
  );
}
