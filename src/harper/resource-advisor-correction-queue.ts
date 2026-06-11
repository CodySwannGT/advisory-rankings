import type {
  AdvisorCorrectionRequestRow,
  AdvisorRow,
  FirmRow,
} from "../types/harper-schema.js";
import type { ResourceIndex } from "./resource-data.js";

import { loadAll } from "./resource-data.js";
import { advisorDisplayName } from "./resource-routing.js";
import {
  rowsFor,
  type SearchableTable,
} from "./resource-user-watchlists-store.js";

/** Analyst-facing pending correction request row. */
export interface AdvisorCorrectionRequestQueueItem {
  readonly id: string;
  readonly advisorId: string;
  readonly advisorName: string;
  readonly advisorUrl: string;
  readonly firmName: string | null;
  readonly fieldName: string;
  readonly displayedValue: string | null;
  readonly proposedValue: string;
  readonly submitterId: string;
  readonly submitterNote: string | null;
  readonly sourceType: string | null;
  readonly sourceRef: string | null;
  readonly sourceContext: string | null;
  readonly status: string;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly ageDays: number | null;
}

/** Summary counts for the analyst correction request inbox. */
interface AdvisorCorrectionRequestQueueSummary {
  readonly pending: number;
  readonly oldestAgeDays: number | null;
}

/** Analyst-facing correction request inbox payload. */
export interface AdvisorCorrectionRequestQueueResponse {
  readonly authenticated: boolean;
  readonly authorized: boolean;
  readonly generatedAt: string;
  readonly summary: AdvisorCorrectionRequestQueueSummary;
  readonly items: ReadonlyArray<AdvisorCorrectionRequestQueueItem>;
}

/**
 * Lists pending correction requests for analyst review.
 * @param table Backing correction request table.
 * @returns Analyst queue payload.
 */
export async function correctionRequestQueue(
  table: SearchableTable<AdvisorCorrectionRequestRow>
): Promise<AdvisorCorrectionRequestQueueResponse> {
  const rows = (await rowsFor(table, "status", "pending"))
    .slice()
    .sort(comparePendingRequests);
  const db = await loadAll();
  const items = rows.map(row => queueItem(row, db));
  return {
    authenticated: true,
    authorized: true,
    generatedAt: new Date().toISOString(),
    summary: {
      pending: items.length,
      oldestAgeDays: items[0]?.ageDays ?? null,
    },
    items,
  };
}

/**
 * Builds the anonymous or unauthorized correction queue envelope.
 * @param authenticated Whether the caller has a session.
 * @param authorized Whether the caller can review requests.
 * @returns Empty queue response without private row data.
 */
export function emptyCorrectionRequestQueue(
  authenticated: boolean,
  authorized: boolean
): AdvisorCorrectionRequestQueueResponse {
  return {
    authenticated,
    authorized,
    generatedAt: new Date().toISOString(),
    summary: { pending: 0, oldestAgeDays: null },
    items: [],
  };
}

/**
 * Converts one pending row into the analyst inbox shape.
 * @param row Persisted correction request.
 * @param db Public resource index used for advisor display labels.
 * @returns Inbox row.
 */
function queueItem(
  row: AdvisorCorrectionRequestRow,
  db: ResourceIndex
): AdvisorCorrectionRequestQueueItem {
  const advisor = db.byAdvisor.get(row.advisorId);
  return {
    id: row.id,
    advisorId: row.advisorId,
    advisorName: advisor ? advisorDisplayName(advisor) : row.advisorId,
    advisorUrl: `/advisor.html?id=${encodeURIComponent(row.advisorId)}`,
    firmName: currentFirmName(advisor, db),
    fieldName: row.fieldName,
    displayedValue: nullableText(row.displayedValue),
    proposedValue: row.proposedValue,
    submitterId: row.submitterId,
    submitterNote: nullableText(row.submitterNote),
    sourceType: nullableText(row.sourceType),
    sourceRef: nullableText(row.sourceRef),
    sourceContext: nullableText(row.sourceContext),
    status: row.status,
    createdAt: dateString(row.createdAt),
    updatedAt: dateString(row.updatedAt),
    ageDays: ageDays(row.createdAt),
  };
}

/**
 * Sorts pending requests by age, then stable id.
 * @param left First row.
 * @param right Second row.
 * @returns Sort order.
 */
function comparePendingRequests(
  left: AdvisorCorrectionRequestRow,
  right: AdvisorCorrectionRequestRow
): number {
  return (
    String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Resolves the advisor's current firm display name.
 * @param advisor Advisor row, if loaded.
 * @param db Public resource index.
 * @returns Firm name or null.
 */
function currentFirmName(
  advisor: AdvisorRow | undefined,
  db: ResourceIndex
): string | null {
  const firm = advisor ? currentFirm(advisor, db) : null;
  return firm?.name ?? null;
}

/**
 * Finds the latest employment firm for an advisor.
 * @param advisor Advisor row.
 * @param db Public resource index.
 * @returns Firm row or null.
 */
function currentFirm(advisor: AdvisorRow, db: ResourceIndex): FirmRow | null {
  const latest = db.employments
    .filter(row => row.advisorId === advisor.id)
    .slice()
    .sort((left, right) =>
      String(right.startDate ?? "").localeCompare(String(left.startDate ?? ""))
    )[0];
  return latest ? (db.byFirm.get(latest.firmId) ?? null) : null;
}

/**
 * Normalizes optional string fields for response JSON.
 * @param value Candidate value.
 * @returns Non-empty string or null.
 */
function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Normalizes Harper date values into string responses.
 * @param value Candidate date value.
 * @returns Date string or null.
 */
function dateString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Computes whole days since creation for queue aging.
 * @param value Candidate created-at value.
 * @returns Non-negative age in days, or null when unavailable.
 */
function ageDays(value: unknown): number | null {
  const text = dateString(value);
  if (!text) return null;
  const createdAt = Date.parse(text);
  if (Number.isNaN(createdAt)) return null;
  return Math.max(0, Math.floor((Date.now() - createdAt) / 86_400_000));
}
