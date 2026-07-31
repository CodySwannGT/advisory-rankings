import { datePrefix } from "./brokercheck-resolver-helpers.js";
import { disclosureId } from "./ids.js";

/** Disclosure fields shared by cache keys and deterministic minted IDs. */
interface DisclosureIdParts {
  readonly advisorIdValue: string;
  readonly dateInitiated: string;
  readonly disclosureType: string;
  readonly docketNumber: string | undefined;
  readonly regulator: string;
}

/**
 * Builds the disclosure resolver cache key.
 * @param parts - Disclosure identity fields.
 * @returns Disclosure resolver cache key.
 */
export const disclosureCacheKeyFor = (parts: DisclosureIdParts): string =>
  JSON.stringify([
    "disc",
    parts.advisorIdValue,
    parts.disclosureType,
    datePrefix(parts.dateInitiated),
    parts.docketNumber ?? "",
    parts.regulator,
  ]);

/**
 * Builds a deterministic disclosure ID when no existing row matches.
 * @param parts - Disclosure identity fields.
 * @returns Minted disclosure ID.
 */
export const mintedDisclosureId = (parts: DisclosureIdParts): string =>
  disclosureId(
    parts.advisorIdValue,
    parts.disclosureType,
    datePrefix(parts.dateInitiated),
    parts.docketNumber || parts.regulator
  );
