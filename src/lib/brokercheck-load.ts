import { HarperREST } from "./brokercheck-rest.js";
import {
  advisorId as canonicalAdvisorId,
  disclosureId,
  employmentHistoryId,
  sanctionId,
  slugify,
  uid,
} from "./ids.js";
import {
  canonicalFirmId,
  curatedFirmAliasRows,
  normalizeFirmAlias,
  resolveFirmIdentity,
} from "./firm-identity.js";
import {
  asRows,
  datePrefix,
  firmNameMatch,
  initialStats,
  matchAdvisorFirstLast,
  matchAdvisorLegalName,
  rowString,
  type AdvisorResolverOptions,
  type FirmCrdHit,
  type HarperRow,
  type ResolverStatKey,
  type ResolverStats,
} from "./brokercheck-resolver-helpers.js";

export {
  hashContent,
  loadFirm,
  loadIndividual,
} from "./brokercheck-load-records.js";
export { HarperREST } from "./brokercheck-rest.js";

/** Per-instance cached listings and resolver counters for the Resolver. */
interface ResolverState {
  readonly firmListing: ReadonlyArray<HarperRow> | null;
  readonly firmAliasListing: ReadonlyArray<HarperRow> | null;
  readonly advisorListing: ReadonlyArray<HarperRow> | null;
  readonly stats: ResolverStats;
}

/**
 * Resolves BrokerCheck firm and advisor mentions to canonical Harper IDs.
 */
export class Resolver {
  readonly rest: HarperREST;
  readonly cache = new Map<string, string>();
  readonly state: ResolverState = {
    firmListing: null,
    firmAliasListing: null,
    advisorListing: null,
    stats: initialStats(),
  };

  /**
   * Exposes the mutable resolver statistic counters.
   * @returns The current statistic counter map.
   */
  get stats(): ResolverStats {
    return this.state.stats;
  }

  /**
   * Exposes the cached Harper firm listing for downstream record builders.
   * @returns Cached firm rows, or null when not yet loaded.
   */
  get firmListing(): ReadonlyArray<HarperRow> | null {
    return this.state.firmListing;
  }

  /**
   * Exposes the cached Harper advisor listing for downstream record builders.
   * @returns Cached advisor rows, or null when not yet loaded.
   */
  get advisorListing(): ReadonlyArray<HarperRow> | null {
    return this.state.advisorListing;
  }

  /**
   * Exposes the cached Harper firm-alias listing for downstream record builders.
   * @returns Cached firm-alias rows, or null when not yet loaded.
   */
  get firmAliasListing(): ReadonlyArray<HarperRow> | null {
    return this.state.firmAliasListing;
  }

  /**
   * Stores a HarperREST handle that backs every Resolver lookup.
   * @param rest - REST client used for `/Firm/`, `/Advisor/`, `/Disclosure/` reads.
   */
  constructor(rest: HarperREST) {
    this.rest = rest;
  }

  /**
   * Resolves a BrokerCheck firm mention to an existing or deterministic firm ID.
   * @param names - Candidate legal, display, and alias names from BrokerCheck.
   * @param finraCrd - Optional FINRA firm CRD.
   * @returns Canonical firm ID for downstream relationship rows.
   */
  async firm(names: readonly string[], finraCrd?: string): Promise<string> {
    const firmNames = names.filter(Boolean);
    const cacheKey = JSON.stringify(["firm", finraCrd ?? "", firmNames]);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const curatedId = this.resolveCuratedFirmId(firmNames);
    if (curatedId)
      return this.remember(cacheKey, curatedId, "firm_matched_name");
    const crdHit = finraCrd ? await this.matchFirmByCrd(finraCrd) : null;
    if (crdHit) return this.remember(cacheKey, crdHit.id, crdHit.stat);
    const aliasHit = await this.matchFirmAlias(firmNames);
    if (aliasHit) return this.remember(cacheKey, aliasHit, "firm_matched_name");
    const listingHit = await this.matchFirmListing(firmNames);
    if (listingHit)
      return this.remember(cacheKey, listingHit, "firm_matched_name");
    const id = canonicalFirmId(
      firmNames[0] ?? `firm-crd-${finraCrd ?? "unknown"}`
    );
    return this.remember(cacheKey, id, "firm_minted");
  }

  /**
   * Resolves a curated firm ID from ids, slugs, or aliases.
   * @param names - Candidate names from BrokerCheck.
   * @returns Canonical firm ID, or null when no curated alias matches.
   */
  resolveCuratedFirmId(names: readonly string[]): string | null {
    for (const name of names) {
      const identity = resolveFirmIdentity(name);
      const reuseCurated =
        identity.canonicalName !== name ||
        identity.canonicalId === canonicalFirmId(name);
      const aliasOrCanonical =
        identity.matchedAlias || identity.canonicalName !== name;
      if (reuseCurated && aliasOrCanonical) return identity.canonicalId;
    }
    return null;
  }

  /**
   * Matches a firm by curated or stored alias names.
   * @param names - Candidate names from BrokerCheck.
   * @returns Canonical firm ID when an alias matches, otherwise null.
   */
  async matchFirmAlias(names: readonly string[]): Promise<string | null> {
    const storedAliases = await this.loadListing(
      "firmAliasListing",
      "/FirmAlias/"
    );
    const aliases = [...curatedFirmAliasRows(), ...storedAliases];
    for (const name of names) {
      const normalized = normalizeFirmAlias(name);
      const match = aliases.find(row => row.normalizedAlias === normalized);
      if (match?.firmId) return String(match.firmId);
    }
    return null;
  }

  /**
   * Resolves a BrokerCheck individual to an existing or deterministic advisor ID.
   * @param finraCrd - FINRA individual CRD when BrokerCheck provided one.
   * @param legalName - Advisor legal name from the parsed BrokerCheck profile.
   * @param opts - Optional name and employer hints used for fallback matching.
   * @param opts.firstEmployer - Employer hint used when minting a deterministic ID.
   * @param opts.firstName - Parsed first name for first/last fallback matching.
   * @param opts.lastName - Parsed last name for first/last fallback matching.
   * @returns Advisor ID for profile, disclosure, and employment rows.
   */
  async advisor(
    finraCrd: string,
    legalName: string,
    opts: AdvisorResolverOptions = {}
  ): Promise<string> {
    const cacheKey = JSON.stringify(["advisor", finraCrd, legalName]);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const crdHit = finraCrd ? await this.matchAdvisorByCrd(finraCrd) : null;
    if (crdHit) return this.remember(cacheKey, crdHit, "advisor_matched_crd");
    const nameHit = await this.matchAdvisorByName(legalName, opts);
    if (nameHit)
      return this.remember(cacheKey, nameHit, "advisor_matched_name");
    const hint = finraCrd ? `crd-${finraCrd}` : (opts.firstEmployer ?? "");
    const id = canonicalAdvisorId(legalName, hint);
    return this.remember(cacheKey, id, "advisor_minted");
  }

  /**
   * Stores a resolved entity ID and increments the matching resolver counter.
   * @param cacheKey - Serialized resolver input tuple.
   * @param id - Entity ID resolved for that tuple.
   * @param stat - Resolver statistic that explains how the ID was found.
   * @returns The resolved entity ID.
   */
  remember(cacheKey: string, id: string, stat: ResolverStatKey): string {
    this.state.stats[stat]++;
    this.cache.set(cacheKey, id);
    return id;
  }

  /**
   * Checks Harper for an existing firm with the same FINRA CRD.
   * @param finraCrd - FINRA firm CRD from BrokerCheck.
   * @returns Matched firm ID and match type, or null when none exists.
   */
  async matchFirmByCrd(finraCrd: string): Promise<FirmCrdHit | null> {
    const hit = asRows(await this.rest.get("/Firm/", { finraCrd }));
    const row = hit[0];
    if (!row) return null;
    const canonicalHitId = this.resolveCuratedFirmId([rowString(row.name)]);
    return canonicalHitId
      ? { id: canonicalHitId, stat: "firm_matched_name" }
      : { id: rowString(row.id), stat: "firm_matched_crd" };
  }

  /**
   * Searches the cached Harper firm listing by normalized firm name.
   * @param firmNames - Candidate names from the BrokerCheck record.
   * @returns Existing firm ID when exactly a stored display name matches.
   */
  async matchFirmListing(firmNames: readonly string[]): Promise<string | null> {
    const firmListing = await this.loadListing("firmListing", "/Firm/");
    const match = firmNames
      .flatMap(name => firmListing.map(row => ({ name, row })))
      .find(candidate =>
        firmNameMatch(rowString(candidate.row.name), candidate.name)
      );
    return match ? rowString(match.row.id) : null;
  }

  /**
   * Checks Harper for an existing advisor with the same FINRA CRD.
   * @param finraCrd - FINRA individual CRD from BrokerCheck.
   * @returns Existing advisor ID, or null when the CRD is not loaded yet.
   */
  async matchAdvisorByCrd(finraCrd: string): Promise<string | null> {
    const row = asRows(await this.rest.get("/Advisor/", { finraCrd }))[0];
    return row ? rowString(row.id) || null : null;
  }

  /**
   * Searches cached advisor rows by legal name and first/last fallback hints.
   * @param legalName - Full legal name from BrokerCheck.
   * @param opts - First and last name hints parsed from BrokerCheck.
   * @returns Existing advisor ID, or null when the name is ambiguous or absent.
   */
  async matchAdvisorByName(
    legalName: string,
    opts: AdvisorResolverOptions
  ): Promise<string | null> {
    const advisorListing = await this.loadListing(
      "advisorListing",
      "/Advisor/"
    );
    return (
      matchAdvisorLegalName(advisorListing, legalName) ??
      matchAdvisorFirstLast(advisorListing, opts)
    );
  }

  /**
   * Lazily loads a cached Harper listing into resolver state.
   * @param key - Listing slot on {@link ResolverState} to populate and return.
   * @param path - Harper REST path that produces the listing rows.
   * @returns Cached or freshly fetched listing rows.
   */
  private async loadListing(
    key: "firmListing" | "firmAliasListing" | "advisorListing",
    path: string
  ): Promise<ReadonlyArray<HarperRow>> {
    const cached = this.state[key];
    if (cached) return cached;
    const rows = asRows(await this.rest.get(path));
    Object.assign(this.state, { [key]: rows });
    return rows;
  }

  /**
   * Resolves or mints a disclosure ID for an advisor, deduplicating against Harper.
   * @param advisorIdValue - Advisor id used in deterministic ids.
   * @param disclosureType - Disclosure category.
   * @param dateInitiated - Date the disclosure was initiated.
   * @param docketNumber - Optional docket number for the disclosure.
   * @param regulator - Optional regulator label used when no docket is present.
   * @returns Existing or freshly minted disclosure ID.
   */
  async disclosure(
    advisorIdValue: string,
    disclosureType: string,
    dateInitiated: string,
    docketNumber?: string,
    regulator = ""
  ): Promise<string> {
    const cacheKey = JSON.stringify([
      "disc",
      advisorIdValue,
      disclosureType,
      datePrefix(dateInitiated),
      docketNumber ?? "",
      regulator,
    ]);
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;
    const matched = await this.findDisclosureMatch(
      advisorIdValue,
      disclosureType,
      dateInitiated,
      docketNumber
    );
    if (matched) {
      this.state.stats.disclosure_matched++;
      this.cache.set(cacheKey, matched);
      return matched;
    }
    const id = disclosureId(
      advisorIdValue,
      disclosureType,
      datePrefix(dateInitiated),
      docketNumber || regulator
    );
    this.state.stats.disclosure_minted++;
    this.cache.set(cacheKey, id);
    return id;
  }

  /**
   * Searches existing Harper disclosures for an exact dedup match.
   * @param advisorIdValue - Advisor id used to scope the search.
   * @param disclosureType - Disclosure category that must match.
   * @param dateInitiated - Date prefix that must match.
   * @param docketNumber - Optional docket number that must match when provided.
   * @returns Matching disclosure ID, or null when nothing matches.
   */
  private async findDisclosureMatch(
    advisorIdValue: string,
    disclosureType: string,
    dateInitiated: string,
    docketNumber: string | undefined
  ): Promise<string | null> {
    const existing = asRows(
      await this.rest.get("/Disclosure/", { advisorId: advisorIdValue })
    );
    const wantDate = datePrefix(dateInitiated);
    const match = existing.find(
      d =>
        d.disclosureType === disclosureType &&
        datePrefix(d.dateInitiated) === wantDate &&
        ((docketNumber && d.docketNumber === docketNumber) || !docketNumber)
    );
    return match ? rowString(match.id) : null;
  }

  /**
   * Builds a deterministic employment-history ID for an advisor/firm/start tuple.
   * @param advisorIdValue - Advisor id used in deterministic ids.
   * @param firmIdValue - Firm id used in deterministic ids.
   * @param startDate - Employment start date.
   * @returns Deterministic employment-history ID.
   */
  employment(
    advisorIdValue: string,
    firmIdValue: string,
    startDate: string
  ): string {
    return employmentHistoryId(
      advisorIdValue,
      firmIdValue,
      datePrefix(startDate)
    );
  }

  /**
   * Builds a deterministic sanction ID for a disclosure/type/amount/duration tuple.
   * @param disclosureIdValue - Parent disclosure id.
   * @param sanctionType - Sanction category.
   * @param amount - Optional monetary amount.
   * @param duration - Optional duration in months.
   * @returns Deterministic sanction ID.
   */
  sanction(
    disclosureIdValue: string,
    sanctionType: string,
    amount?: number,
    duration?: number
  ): string {
    return sanctionId(
      disclosureIdValue,
      sanctionType,
      String(amount || ""),
      String(duration || "")
    );
  }

  /**
   * Builds a deterministic license ID for an advisor/license/date tuple.
   * @param advisorIdValue - Advisor id used in deterministic ids.
   * @param licenseType - License or registration type.
   * @param grantedDate - Date the license was granted.
   * @returns Deterministic license ID.
   */
  license(
    advisorIdValue: string,
    licenseType: string,
    grantedDate: string
  ): string {
    return uid(
      `lic:${advisorIdValue}:${slugify(licenseType)}:${datePrefix(grantedDate)}`
    );
  }
}
