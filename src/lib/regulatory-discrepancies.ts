import { uid } from "./ids.js";
import type {
  DisclosureRow,
  FieldAssertionRow,
  RegulatoryDiscrepancyRow,
  SanctionRow,
} from "../types/harper-schema.js";

/** Source rows consumed by the discrepancy detector. */
interface RegulatoryDiscrepancyInput {
  readonly disclosures: readonly DisclosureRow[];
  readonly sanctions: readonly SanctionRow[];
  readonly fieldAssertions: readonly FieldAssertionRow[];
}

/** AdvisorHub assertion resolved to its sanction and disclosure context. */
interface SourceAssertion {
  readonly field: MaterialField;
  readonly assertion: FieldAssertionRow;
  readonly sanction: SanctionRow;
  readonly disclosure: DisclosureRow;
  readonly value: string;
  readonly normalizedValue: string;
}

/** BrokerCheck sanction value resolved to its disclosure context. */
interface BrokerCheckValue {
  readonly sanction: SanctionRow;
  readonly disclosure: DisclosureRow;
  readonly value: string;
  readonly normalizedValue: string;
}

/** Material sanction field supported by the conservative detector. */
interface MaterialField {
  readonly assertionFieldName: string;
  readonly discrepancyFieldName: string;
  readonly sanctionType: string;
  readonly sanctionValueKey: "amount" | "durationMonths";
}

const MATERIAL_FIELDS: readonly MaterialField[] = [
  {
    assertionFieldName: "amount",
    discrepancyFieldName: "fineAmount",
    sanctionType: "fine",
    sanctionValueKey: "amount",
  },
  {
    assertionFieldName: "durationMonths",
    discrepancyFieldName: "suspensionMonths",
    sanctionType: "suspension",
    sanctionValueKey: "durationMonths",
  },
  {
    assertionFieldName: "durationMonths",
    discrepancyFieldName: "barMonths",
    sanctionType: "bar",
    sanctionValueKey: "durationMonths",
  },
];

/**
 * Detects material AdvisorHub-vs-BrokerCheck disclosure discrepancies.
 * Matching is conservative: rows must describe the same advisor and sanction
 * type, then share a docket, cluster, or regulator/date evidence.
 * @param input - Source disclosure, sanction, and AdvisorHub assertion rows.
 * @returns Open discrepancy rows preserving both normalized source values.
 */
export function detectMaterialDisclosureDiscrepancies(
  input: RegulatoryDiscrepancyInput
): readonly RegulatoryDiscrepancyRow[] {
  const disclosureById = new Map(input.disclosures.map(row => [row.id, row]));
  const sanctionById = new Map(input.sanctions.map(row => [row.id, row]));
  const brokerCheckValues = input.sanctions.flatMap(sanction =>
    brokerCheckValue(sanction, disclosureById)
  );
  return input.fieldAssertions
    .flatMap(assertion =>
      sourceAssertion(assertion, sanctionById, disclosureById)
    )
    .flatMap(source =>
      discrepanciesForSource(
        source,
        brokerCheckValues.filter(candidate =>
          isComparableEvent(source, candidate)
        )
      )
    );
}

const sourceAssertion = (
  assertion: FieldAssertionRow,
  sanctionById: ReadonlyMap<string, SanctionRow>,
  disclosureById: ReadonlyMap<string, DisclosureRow>
): readonly SourceAssertion[] => {
  if (assertion.targetTable !== "Sanction") return [];
  const sanction = sanctionById.get(assertion.targetId);
  if (!sanction) return [];
  const disclosure = disclosureById.get(sanction.disclosureId);
  if (!disclosure || disclosure.sourceType === "brokercheck") return [];
  const field = MATERIAL_FIELDS.find(
    candidate =>
      candidate.assertionFieldName === assertion.fieldName &&
      candidate.sanctionType === sanction.sanctionType
  );
  if (!field) return [];
  const normalizedValue = normalizeValue(assertion.assertedValue);
  if (!normalizedValue) return [];
  return [
    {
      field,
      assertion,
      sanction,
      disclosure,
      value: normalizedValue,
      normalizedValue,
    },
  ];
};

const brokerCheckValue = (
  sanction: SanctionRow,
  disclosureById: ReadonlyMap<string, DisclosureRow>
): readonly BrokerCheckValue[] => {
  const disclosure = disclosureById.get(sanction.disclosureId);
  if (disclosure?.sourceType !== "brokercheck") return [];
  const field = MATERIAL_FIELDS.find(
    candidate => candidate.sanctionType === sanction.sanctionType
  );
  if (!field) return [];
  const rawValue = sanction[field.sanctionValueKey];
  const normalizedValue = normalizeValue(rawValue);
  if (!normalizedValue) return [];
  return [{ sanction, disclosure, value: normalizedValue, normalizedValue }];
};

const discrepanciesForSource = (
  source: SourceAssertion,
  candidates: readonly BrokerCheckValue[]
): readonly RegulatoryDiscrepancyRow[] =>
  candidates
    .filter(candidate => candidate.normalizedValue !== source.normalizedValue)
    .map(candidate => discrepancyRow(source, candidate));

const discrepancyRow = (
  source: SourceAssertion,
  brokerCheck: BrokerCheckValue
): RegulatoryDiscrepancyRow => ({
  id: uid(
    [
      "regdisc",
      source.disclosure.advisorId,
      source.field.discrepancyFieldName,
      source.disclosure.id,
      brokerCheck.disclosure.id,
      source.normalizedValue,
      brokerCheck.normalizedValue,
    ].join(":")
  ),
  advisorId: source.disclosure.advisorId,
  fieldName: source.field.discrepancyFieldName,
  advisorHubSourceType: "advisorhub_article",
  advisorHubSourceRef: source.assertion.articleId,
  advisorHubValue: source.normalizedValue,
  brokerCheckSourceType: "brokercheck",
  brokerCheckSourceRef:
    brokerCheck.disclosure.sourceRef ??
    `crd:${brokerCheck.disclosure.advisorId}:docket:${brokerCheck.disclosure.docketNumber ?? ""}`,
  brokerCheckValue: brokerCheck.normalizedValue,
  sourceMetadata: JSON.stringify({
    regulator: brokerCheck.disclosure.regulator ?? source.disclosure.regulator,
    docketNumber:
      brokerCheck.disclosure.docketNumber ?? source.disclosure.docketNumber,
    advisorHubDisclosureId: source.disclosure.id,
    brokerCheckDisclosureId: brokerCheck.disclosure.id,
    advisorHubSanctionId: source.sanction.id,
    brokerCheckSanctionId: brokerCheck.sanction.id,
  }),
  severity: "high",
  status: "open",
});

const isComparableEvent = (
  source: SourceAssertion,
  candidate: BrokerCheckValue
): boolean =>
  source.field.sanctionType === candidate.sanction.sanctionType &&
  source.disclosure.advisorId === candidate.disclosure.advisorId &&
  hasSharedEventEvidence(source.disclosure, candidate.disclosure);

const hasSharedEventEvidence = (
  advisorHub: DisclosureRow,
  brokerCheck: DisclosureRow
): boolean =>
  sharesDocket(advisorHub, brokerCheck) ||
  sharesCluster(advisorHub, brokerCheck) ||
  sharesRegulatorAndNearbyDate(advisorHub, brokerCheck);

const sharesDocket = (
  advisorHub: DisclosureRow,
  brokerCheck: DisclosureRow
): boolean =>
  Boolean(
    advisorHub.docketNumber &&
    brokerCheck.docketNumber &&
    normalizeToken(advisorHub.docketNumber) ===
      normalizeToken(brokerCheck.docketNumber)
  );

const sharesCluster = (
  advisorHub: DisclosureRow,
  brokerCheck: DisclosureRow
): boolean =>
  Boolean(
    advisorHub.clusterId &&
    brokerCheck.clusterId &&
    advisorHub.clusterId === brokerCheck.clusterId
  );

const sharesRegulatorAndNearbyDate = (
  advisorHub: DisclosureRow,
  brokerCheck: DisclosureRow
): boolean => {
  const advisorHubRegulator = normalizeToken(advisorHub.regulator);
  const brokerCheckRegulator = normalizeToken(brokerCheck.regulator);
  return Boolean(
    advisorHubRegulator &&
    brokerCheckRegulator &&
    advisorHubRegulator === brokerCheckRegulator &&
    datesWithinDays(advisorHub.dateInitiated, brokerCheck.dateInitiated, 45)
  );
};

const datesWithinDays = (
  left: unknown,
  right: unknown,
  maxDays: number
): boolean => {
  const leftDate = dateMs(left);
  const rightDate = dateMs(right);
  if (leftDate === null || rightDate === null) return false;
  return Math.abs(leftDate - rightDate) <= maxDays * 24 * 60 * 60 * 1000;
};

const dateMs = (value: unknown): number | null => {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== "string" || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

const normalizeValue = (value: unknown): string => {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  const parsed = parseJsonScalar(value);
  if (typeof parsed === "number") return String(parsed);
  if (typeof parsed === "string") return normalizeNumericString(parsed);
  return normalizeNumericString(value);
};

const parseJsonScalar = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const normalizeNumericString = (value: string): string => {
  const compact = value.replaceAll(",", "").replace(/[^\d.-]/gu, "");
  if (!compact || compact === "-" || compact === ".") return "";
  const parsed = Number(compact);
  return Number.isFinite(parsed) ? String(parsed) : "";
};

const normalizeToken = (value: unknown): string =>
  typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]/gu, "")
    : "";
