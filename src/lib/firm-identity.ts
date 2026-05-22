import { firmId, uid } from "./ids.js";

/**
 * Curated alias rule that maps a source-specific firm label to a canonical firm.
 * @remarks These entries are intentionally reviewed by humans; automated duplicate
 * detection reports candidates separately so imports do not accidentally merge
 * legally distinct firms.
 */
interface FirmAliasDefinition {
  readonly canonicalName: string;
  readonly alias: string;
  readonly sourceType: string;
  readonly sourceRef: string;
  readonly confidence: string;
}

/**
 * Result of resolving a source firm label through the curated identity table.
 * @remarks Importers use the canonical id/name for foreign keys while retaining
 * matchedAlias so the source label can be preserved as provenance.
 */
interface ResolvedFirmIdentity {
  readonly inputName: string;
  readonly canonicalName: string;
  readonly canonicalId: string;
  readonly matchedAlias: string | null;
  readonly normalizedInput: string;
}

/** Canonical display name used for Morgan Stanley firm rows and profile URLs. */
export const MORGAN_STANLEY_CANONICAL_NAME = "Morgan Stanley";

/** Source label that appears in wealth-management feeds but resolves to Morgan Stanley. */
export const MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS =
  "Morgan Stanley Wealth Management";

/**
 * Approved firm aliases that are safe for automatic canonicalization.
 * @remarks Keeping this list small and explicit prevents heuristic matching from
 * rewriting firm foreign keys without a reviewed business decision.
 */
const CURATED_FIRM_ALIASES: ReadonlyArray<FirmAliasDefinition> = [
  {
    canonicalName: MORGAN_STANLEY_CANONICAL_NAME,
    alias: MORGAN_STANLEY_WEALTH_MANAGEMENT_ALIAS,
    sourceType: "curated",
    sourceRef: "firm-aliases:v1",
    confidence: "approved",
  },
];

const identityByNormalizedName = new Map<string, FirmAliasDefinition>(
  CURATED_FIRM_ALIASES.flatMap(definition => [
    [normalizeFirmAlias(definition.alias), definition],
    [
      normalizeFirmAlias(definition.canonicalName),
      { ...definition, alias: definition.canonicalName },
    ],
  ])
);

/**
 * Normalizes firm labels into a stable alias lookup key.
 * @param value - Firm name as it appeared in a source feed, scraper, or seed file.
 * @returns Case-folded firm key with punctuation, whitespace, and common legal suffixes removed.
 */
export function normalizeFirmAlias(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[.,]/g, " ")
    .replace(/\b(corp|corporation|inc|l\.?\s*l\.?\s*c|l\.?\s*p|llc|lp)\b/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a source firm label to the reviewed canonical firm identity.
 * @param name - Firm label from importer input or existing firm rows.
 * @returns Canonical firm metadata plus the matched alias when a curated alias was used.
 */
export function resolveFirmIdentity(name: string): ResolvedFirmIdentity {
  const normalizedInput = normalizeFirmAlias(name);
  const alias = identityByNormalizedName.get(normalizedInput);
  const canonicalName = alias?.canonicalName ?? name;
  return {
    inputName: name,
    canonicalName,
    canonicalId: firmId(canonicalName),
    matchedAlias:
      alias &&
      normalizeFirmAlias(alias.alias) !==
        normalizeFirmAlias(alias.canonicalName)
        ? alias.alias
        : null,
    normalizedInput,
  };
}

/**
 * Returns the canonical display name for import paths that only need a label.
 * @param name - Source firm label to resolve.
 * @returns Reviewed canonical display name, or the original label when no alias matches.
 */
export function canonicalFirmName(name: string): string {
  return resolveFirmIdentity(name).canonicalName;
}

/**
 * Returns the deterministic canonical Firm id for import foreign keys.
 * @param name - Source firm label to resolve before id generation.
 * @returns Stable Firm id derived from the canonical display name.
 */
export function canonicalFirmId(name: string): string {
  return resolveFirmIdentity(name).canonicalId;
}

/**
 * Builds a stable FirmAlias id from the canonical firm and normalized alias text.
 * @param firmIdValue - Canonical Firm id that owns the alias.
 * @param alias - Alias label as preserved from source data.
 * @returns Deterministic FirmAlias id suitable for idempotent upserts.
 */
export function firmAliasId(firmIdValue: string, alias: string): string {
  return uid(`firm-alias:${firmIdValue}:${normalizeFirmAlias(alias)}`);
}

/**
 * Converts curated alias definitions into seed/upsert-ready FirmAlias rows.
 * @returns Harper row objects for the reviewed alias table.
 */
export function curatedFirmAliasRows(): ReadonlyArray<Record<string, unknown>> {
  return CURATED_FIRM_ALIASES.map(definition => {
    const canonicalId = firmId(definition.canonicalName);
    return {
      id: firmAliasId(canonicalId, definition.alias),
      firmId: canonicalId,
      alias: definition.alias,
      normalizedAlias: normalizeFirmAlias(definition.alias),
      sourceType: definition.sourceType,
      sourceRef: definition.sourceRef,
      confidence: definition.confidence,
    };
  });
}
