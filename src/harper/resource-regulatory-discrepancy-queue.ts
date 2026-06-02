import { advisorDisplayName } from "./resource-routing.js";
import { loadAll } from "./resource-data.js";
import type { ResourceIndex } from "./resource-data.js";
import type {
  AdvisorRow,
  DisclosureRow,
  FirmRow,
  HarperDate,
  RegulatoryDiscrepancyRow,
} from "../types/harper-schema.js";

const OPEN_STATUS = "open";
const REVIEW_ACTIONS = [
  "accepted_brokercheck",
  "accepted_advisorhub",
  "needs_followup",
  "not_a_conflict",
] as const;

/** Provenance pointer for one queue item. */
interface DiscrepancyProvenance {
  readonly sourceTable: "RegulatoryDiscrepancy";
  readonly sourceIds: ReadonlyArray<string>;
}

/** Minimal current-user fields used by the auth gate. */
interface CurrentUser {
  readonly id?: unknown;
  readonly email?: unknown;
  readonly username?: unknown;
}

/** Summary counts for open discrepancy queue rows. */
export interface RegulatoryDiscrepancyQueueSummary {
  readonly totalOpen: number;
  readonly highSeverity: number;
  readonly severities: Readonly<Record<string, number>>;
}

/** One source-side value shown in the queue. */
interface DiscrepancySourceValue {
  readonly sourceName: string;
  readonly sourceType: string | null;
  readonly sourceRef: string | null;
  readonly value: string | null;
}

/** Regulator and disclosure clues parsed from detector metadata. */
interface DiscrepancyEventContext {
  readonly regulator: string | null;
  readonly docketNumber: string | null;
  readonly disclosureIds: ReadonlyArray<string>;
  readonly disclosureTypes: ReadonlyArray<string>;
  readonly disclosureStatuses: ReadonlyArray<string>;
}

/** Analyst-facing regulatory discrepancy queue row. */
export interface RegulatoryDiscrepancyQueueItem {
  readonly id: string;
  readonly advisorId: string;
  readonly advisorName: string;
  readonly firmName: string | null;
  readonly fieldName: string;
  readonly severity: string;
  readonly status: string;
  readonly advisorHub: DiscrepancySourceValue;
  readonly brokerCheck: DiscrepancySourceValue;
  readonly event: DiscrepancyEventContext;
  readonly reviewerNote: string | null;
  readonly reviewedAt: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly availableActions: ReadonlyArray<(typeof REVIEW_ACTIONS)[number]>;
  readonly provenance: DiscrepancyProvenance;
}

/** Response envelope returned by the discrepancy queue resource. */
export interface RegulatoryDiscrepancyQueueResponse {
  readonly authenticated: boolean;
  readonly generatedAt: string;
  readonly summary: RegulatoryDiscrepancyQueueSummary;
  readonly items: ReadonlyArray<RegulatoryDiscrepancyQueueItem>;
}

/** Harper resource exposing open source conflicts to analyst sessions. */
export class RegulatoryDiscrepancyQueue extends Resource {
  /**
   * Keeps anonymous callers on a stable empty envelope.
   * @returns True because row filtering happens in `get`.
   */
  allowRead(): boolean {
    return true;
  }

  /**
   * Reads open discrepancies and joins analyst review context.
   * @returns Auth-aware discrepancy queue payload.
   */
  async get(): Promise<RegulatoryDiscrepancyQueueResponse> {
    if (!currentUserId(this)) return emptyQueue(false);
    const db = await loadQueueData();
    const rows = db.regulatoryDiscrepancies
      .filter(row => row.status === OPEN_STATUS)
      .slice()
      .sort(compareQueueRows);
    return {
      authenticated: true,
      generatedAt: new Date().toISOString(),
      summary: queueSummary(rows),
      items: rows.map(row => queueItem(row, db)),
    };
  }
}

/**
 * Builds the empty response used for signed-out visitors.
 * @param authenticated - Whether the current caller is authenticated.
 * @returns Empty discrepancy queue payload.
 */
function emptyQueue(
  authenticated: boolean
): RegulatoryDiscrepancyQueueResponse {
  return {
    authenticated,
    generatedAt: new Date().toISOString(),
    summary: { totalOpen: 0, highSeverity: 0, severities: {} },
    items: [],
  };
}

/**
 * Loads the joined resource index with an explicit analyst-queue failure.
 * @returns Loaded resource index.
 */
async function loadQueueData(): Promise<ResourceIndex> {
  try {
    return await loadAll();
  } catch (error) {
    throw new RegulatoryDiscrepancyQueueLoadError(
      "Failed to load regulatory discrepancy queue data",
      error
    );
  }
}

/**
 * Sorts higher severity and older queue rows first.
 * @param left - First row.
 * @param right - Second row.
 * @returns Sort order.
 */
function compareQueueRows(
  left: RegulatoryDiscrepancyRow,
  right: RegulatoryDiscrepancyRow
): number {
  return (
    severityRank(right.severity) - severityRank(left.severity) ||
    String(left.createdAt ?? "").localeCompare(String(right.createdAt ?? "")) ||
    left.id.localeCompare(right.id)
  );
}

/**
 * Converts severity labels into sortable priority.
 * @param severity - Severity label from the row.
 * @returns Numeric rank.
 */
function severityRank(severity: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity] ?? 0;
}

/**
 * Counts open queue rows by severity.
 * @param rows - Open discrepancy rows.
 * @returns Queue summary.
 */
function queueSummary(
  rows: ReadonlyArray<RegulatoryDiscrepancyRow>
): RegulatoryDiscrepancyQueueSummary {
  return {
    totalOpen: rows.length,
    highSeverity: rows.filter(row => severityRank(row.severity) >= 3).length,
    severities: rows.reduce<Record<string, number>>(
      (acc, row) => ({
        ...acc,
        [row.severity]: (acc[row.severity] ?? 0) + 1,
      }),
      {}
    ),
  };
}

/** Error raised when the analyst queue cannot load its backing rows. */
class RegulatoryDiscrepancyQueueLoadError extends Error {
  /**
   * Creates an explicit queue load failure with the original cause attached.
   * @param message - User-safe failure description.
   * @param cause - Underlying load failure.
   */
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "RegulatoryDiscrepancyQueueLoadError";
  }
}

/**
 * Decorates one persisted discrepancy row for the analyst queue.
 * @param row - Source discrepancy row.
 * @param db - Loaded resource index.
 * @returns Queue item.
 */
function queueItem(
  row: RegulatoryDiscrepancyRow,
  db: ResourceIndex
): RegulatoryDiscrepancyQueueItem {
  const advisor = db.byAdvisor.get(row.advisorId);
  return {
    id: row.id,
    advisorId: row.advisorId,
    advisorName: advisor ? advisorDisplayName(advisor) : row.advisorId,
    firmName: currentFirmName(advisor, db),
    fieldName: row.fieldName,
    severity: row.severity,
    status: row.status,
    advisorHub: sourceValue(
      "AdvisorHub",
      row.advisorHubSourceType,
      row.advisorHubSourceRef,
      row.advisorHubValue
    ),
    brokerCheck: sourceValue(
      "FINRA BrokerCheck",
      row.brokerCheckSourceType,
      row.brokerCheckSourceRef,
      row.brokerCheckValue
    ),
    event: eventContext(row, db),
    reviewerNote: row.reviewerNote ?? null,
    reviewedAt: dateString(row.reviewedAt),
    createdAt: dateString(row.createdAt),
    updatedAt: dateString(row.updatedAt),
    availableActions: REVIEW_ACTIONS,
    provenance: {
      sourceTable: "RegulatoryDiscrepancy",
      sourceIds: [row.id],
    },
  };
}

/**
 * Builds one normalized source-side value.
 * @param sourceName - Display source name.
 * @param sourceType - Persisted source type.
 * @param sourceRef - Persisted source reference.
 * @param value - Persisted value.
 * @returns Source value payload.
 */
function sourceValue(
  sourceName: string,
  sourceType: string | undefined,
  sourceRef: string | undefined,
  value: string | undefined
): DiscrepancySourceValue {
  return {
    sourceName,
    sourceType: sourceType ?? null,
    sourceRef: sourceRef ?? null,
    value: value ?? null,
  };
}

/**
 * Resolves the advisor's current firm display name.
 * @param advisor - Advisor row, if found.
 * @param db - Loaded resource index.
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
 * @param advisor - Advisor row.
 * @param db - Loaded resource index.
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
 * Extracts docket, regulator, and disclosure context for a discrepancy.
 * @param row - Source discrepancy row.
 * @param db - Loaded resource index.
 * @returns Event context payload.
 */
function eventContext(
  row: RegulatoryDiscrepancyRow,
  db: ResourceIndex
): DiscrepancyEventContext {
  const metadata = parseMetadata(row.sourceMetadata);
  const disclosureIds = [
    stringValue(metadata.advisorHubDisclosureId),
    stringValue(metadata.brokerCheckDisclosureId),
  ].filter((value): value is string => Boolean(value));
  const disclosures = disclosureIds
    .map(id => db.byDisclosure.get(id))
    .filter((value): value is DisclosureRow => Boolean(value));
  return {
    regulator: stringValue(metadata.regulator),
    docketNumber: stringValue(metadata.docketNumber),
    disclosureIds,
    disclosureTypes: uniqueStrings(
      disclosures.map(item => item.disclosureType)
    ),
    disclosureStatuses: uniqueStrings(disclosures.map(item => item.status)),
  };
}

/**
 * Parses detector metadata without failing the queue.
 * @param metadata - JSON metadata string.
 * @returns Parsed object or empty object.
 */
function parseMetadata(
  metadata: string | undefined
): Readonly<Record<string, unknown>> {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Readonly<Record<string, unknown>>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Normalizes unknown values into non-empty strings.
 * @param value - Candidate value.
 * @returns String or null.
 */
function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Deduplicates defined strings while preserving source order.
 * @param values - Candidate string values.
 * @returns Unique string array.
 */
function uniqueStrings(
  values: ReadonlyArray<string | undefined>
): ReadonlyArray<string> {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

/** Minimal current-user shape used by the auth gate. */
interface CurrentUserResource {
  readonly getCurrentUser?: () => CurrentUser | null | undefined;
}

/**
 * Reads the stable user identifier from Harper's current-user hook.
 * @param resource - Resource instance.
 * @returns User identifier or null.
 */
function currentUserId(resource: CurrentUserResource): string | null {
  const user = resource.getCurrentUser?.();
  return (
    stringValue(user?.id) ||
    stringValue(user?.email) ||
    stringValue(user?.username)
  );
}

/**
 * Converts Harper date fields to JSON-friendly strings.
 * @param value - Date value from Harper.
 * @returns ISO/string date or null.
 */
function dateString(value: HarperDate | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}
