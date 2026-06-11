import type { FmtDate } from "./organisms-events-types.js";
import type { HarperDate } from "../../types/harper-schema.js";

/**
 * Formats optional employment dates into the timeline range label.
 * @param startDate - Employment start date.
 * @param endDate - Employment end date.
 * @param fmtDate - Date formatter supplied by the page.
 * @returns Formatted timeline range label.
 */
export function formatTimelineRange(
  startDate: HarperDate | null | undefined,
  endDate: HarperDate | null | undefined,
  fmtDate: FmtDate | undefined
): string {
  const start = formatTimelineDate(startDate, fmtDate);
  const end = formatTimelineDate(endDate, fmtDate);
  if (start && end) return `${start} – ${end}`;
  if (start) return `${start} – present`;
  if (end) return `Ended ${end}`;
  return "Present";
}

/**
 * Formats one optional timeline date.
 * @param value - Raw timeline date.
 * @param fmtDate - Date formatter supplied by the page.
 * @returns Short date label or null when unavailable.
 */
function formatTimelineDate(
  value: HarperDate | null | undefined,
  fmtDate: FmtDate | undefined
): string | null {
  return value && fmtDate ? fmtDate(value, { mode: "short" }) : null;
}
