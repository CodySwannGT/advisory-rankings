// @ts-nocheck
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
export {
  hashContent,
  loadFirm,
  loadIndividual,
} from "./brokercheck-load-records.js";
export { HarperREST } from "./brokercheck-rest.js";

/** Runtime Harper row returned by REST list endpoints. */
interface HarperRow {
  readonly [key: string]: unknown;
}

/** Optional advisor name hints used when BrokerCheck lacks a reusable CRD match. */
interface AdvisorResolverOptions {
  readonly firstEmployer?: string;
  readonly firstName?: string;
  readonly lastName?: string;
}

const asRows = (value: unknown): ReadonlyArray<HarperRow> =>
  Array.isArray(value) ? value.filter(isHarperRow) : [];
const isHarperRow = (value: unknown): value is HarperRow =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Handles resolver for this workflow.
 */
export class Resolver {
  readonly rest: HarperREST;
  readonly cache = new Map<string, string>();
  readonly firmListing: ReadonlyArray<HarperRow> | null = null;
  readonly firmAliasListing: ReadonlyArray<HarperRow> | null = null;
  readonly advisorListing: ReadonlyArray<HarperRow> | null = null;
  readonly stats = {
    advisor_matched_crd: 0,
    advisor_matched_name: 0,
    advisor_minted: 0,
    firm_matched_crd: 0,
    firm_matched_name: 0,
    firm_minted: 0,
    disclosure_matched: 0,
    disclosure_minted: 0,
    employment_matched: 0,
    employment_minted: 0,
    sanction_matched: 0,
    sanction_minted: 0,
    license_matched: 0,
    license_minted: 0,
  };

  /**
   * Handles constructor for this workflow.
   * @param rest - rest used by this operation.
   * @returns The computed value.
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
   * Resolves curated firm id from ids, slugs, or aliases.
   * @param names - names used by this operation.
   * @returns The computed value.
   */
  resolveCuratedFirmId(names: readonly string[]): string | null {
    for (const name of names) {
      const identity = resolveFirmIdentity(name);
      if (
        identity.canonicalName !== name ||
        identity.canonicalId === canonicalFirmId(name)
      ) {
        if (identity.matchedAlias || identity.canonicalName !== name)
          return identity.canonicalId;
      }
    }
    return null;
  }

  /**
   * Handles match firm alias for this workflow.
   * @param names - names used by this operation.
   * @returns The computed value.
   */
  async matchFirmAlias(names: readonly string[]): Promise<string | null> {
    const storedAliases = (this.firmAliasListing ??= asRows(
      await this.rest.get("/FirmAlias/")
    ));
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
  remember(cacheKey: string, id: string, stat: string): string {
    this.stats[stat]++;
    this.cache.set(cacheKey, id);
    return id;
  }

  /**
   * Checks Harper for an existing firm with the same FINRA CRD.
   * @param finraCrd - FINRA firm CRD from BrokerCheck.
   * @returns Matched firm ID and match type, or null when none exists.
   */
  async matchFirmByCrd(finraCrd: string): Promise<HarperRow | null> {
    const hit = asRows(await this.rest.get("/Firm/", { finraCrd }));
    const row = hit[0];
    if (!row) return null;
    const canonicalHitId = this.resolveCuratedFirmId([String(row.name ?? "")]);
    return canonicalHitId
      ? { id: canonicalHitId, stat: "firm_matched_name" }
      : { id: String(row.id), stat: "firm_matched_crd" };
  }

  /**
   * Searches the cached Harper firm listing by normalized firm name.
   * @param firmNames - Candidate names from the BrokerCheck record.
   * @returns Existing firm ID when exactly a stored display name matches.
   */
  async matchFirmListing(firmNames: readonly string[]): Promise<string | null> {
    this.firmListing ??= asRows(await this.rest.get("/Firm/"));
    const match = firmNames
      .flatMap(name => this.firmListing.map(row => ({ name, row })))
      .find(candidate =>
        firmNameMatch(candidate.row.name ?? "", candidate.name)
      );
    return match ? String(match.row.id) : null;
  }

  /**
   * Checks Harper for an existing advisor with the same FINRA CRD.
   * @param finraCrd - FINRA individual CRD from BrokerCheck.
   * @returns Existing advisor ID, or null when the CRD is not loaded yet.
   */
  async matchAdvisorByCrd(finraCrd: string): Promise<string | null> {
    return (
      String(
        asRows(await this.rest.get("/Advisor/", { finraCrd }))[0]?.id ?? ""
      ) || null
    );
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
    this.advisorListing ??= asRows(await this.rest.get("/Advisor/"));
    return (
      this.matchAdvisorLegalName(legalName) ?? this.matchAdvisorFirstLast(opts)
    );
  }

  /**
   * Matches advisors by exact lowercased legal name.
   * @param legalName - Full legal name from BrokerCheck.
   * @returns Existing advisor ID, or null when no exact name match exists.
   */
  matchAdvisorLegalName(legalName: string): string | null {
    const lower = legalName.toLowerCase();
    const match = lower
      ? this.advisorListing.find(
          row => String(row.legalName ?? "").toLowerCase() === lower
        )
      : null;
    return match ? String(match.id) : null;
  }

  /**
   * Matches advisors by first and last name, including initial/full-name pairs.
   * @param opts - Parsed first and last names from BrokerCheck.
   * @returns Existing advisor ID only when the fallback result is unambiguous.
   */
  matchAdvisorFirstLast(opts: AdvisorResolverOptions): string | null {
    const first = (opts.firstName ?? "").toLowerCase();
    const last = (opts.lastName ?? "").toLowerCase();
    if (!first || !last) return null;
    const firstLast = this.advisorListing.filter(
      row =>
        String(row.firstName ?? "").toLowerCase() === first &&
        String(row.lastName ?? "").toLowerCase() === last
    );
    if (firstLast.length === 1) return String(firstLast[0].id);
    return firstLast.length === 0
      ? this.matchAdvisorLastNameInitial(first, last)
      : null;
  }

  /**
   * Resolves cases where one source has a first initial and the other has a full name.
   * @param first - Lowercased first name from BrokerCheck.
   * @param last - Lowercased last name from BrokerCheck.
   * @returns Existing advisor ID when the last-name match is unique and compatible.
   */
  matchAdvisorLastNameInitial(first: string, last: string): string | null {
    const lastOnly = this.advisorListing.filter(
      row => String(row.lastName ?? "").toLowerCase() === last
    );
    const candidate = lastOnly.length === 1 ? lastOnly[0] : null;
    const candidateFirst = String(candidate?.firstName ?? "")
      .toLowerCase()
      .replace(/\.$/, "");
    const cleanFirst = first.replace(/\.$/, "");
    return candidateFirst &&
      (candidateFirst.startsWith(cleanFirst) ||
        cleanFirst.startsWith(candidateFirst))
      ? String(candidate.id)
      : null;
  }

  /**
   * Handles disclosure for this workflow.
   * @param advisorIdValue - Advisor id used in deterministic ids.
   * @param disclosureType - Disclosure category.
   * @param dateInitiated - date initiated used by this operation.
   * @param docketNumber - docket number used by this operation.
   * @param regulator - Regulator label.
   * @returns The computed value.
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
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)!;
    const existing = await this.rest.get("/Disclosure/", {
      advisorId: advisorIdValue,
    });
    if (Array.isArray(existing)) {
      for (const d of existing) {
        if (
          d.disclosureType === disclosureType &&
          datePrefix(d.dateInitiated) === datePrefix(dateInitiated) &&
          ((docketNumber && d.docketNumber === docketNumber) || !docketNumber)
        ) {
          this.stats.disclosure_matched++;
          this.cache.set(cacheKey, d.id);
          return d.id;
        }
      }
    }
    const id = disclosureId(
      advisorIdValue,
      disclosureType,
      datePrefix(dateInitiated),
      docketNumber || regulator
    );
    this.stats.disclosure_minted++;
    this.cache.set(cacheKey, id);
    return id;
  }

  /**
   * Handles employment for this workflow.
   * @param advisorIdValue - Advisor id used in deterministic ids.
   * @param firmIdValue - Firm id used in deterministic ids.
   * @param startDate - start date used by this operation.
   * @returns The computed value.
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
   * Handles sanction for this workflow.
   * @param disclosureIdValue - disclosure id value used by this operation.
   * @param sanctionType - sanction type used by this operation.
   * @param amount - amount used by this operation.
   * @param duration - duration used by this operation.
   * @returns The computed value.
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
   * Handles license for this workflow.
   * @param advisorIdValue - Advisor id used in deterministic ids.
   * @param licenseType - license type used by this operation.
   * @param grantedDate - granted date used by this operation.
   * @returns The computed value.
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

/**
 * Handles firm name match for this workflow.
 * @param a - Advisor row.
 * @param b - b used by this operation.
 * @returns The computed value.
 */
function firmNameMatch(a: string, b: string): boolean {
  return Boolean(a && b) && normalizeFirmName(a) === normalizeFirmName(b);
}

/**
 * Normalizes firm name for consistent comparisons.
 * @param value - Raw value to normalize or parse.
 * @returns The normalized value.
 */
function normalizeFirmName(value: string): string {
  const compact = value
    .toLowerCase()
    .trim()
    .replaceAll(",", " ")
    .replaceAll(".", " ");
  const token = [
    " llc",
    " l l c",
    " inc",
    " l p",
    " lp",
    " corporation",
    " corp",
  ].find(suffix => compact.endsWith(suffix));
  const withoutSuffix = token ? compact.slice(0, -token.length) : compact;
  return withoutSuffix.split(/\s+/u).join(" ");
}

/**
 * Extracts the date part from BrokerCheck date/time values.
 * @param value - Raw date value from parsed BrokerCheck content.
 * @returns An ISO-like `YYYY-MM-DD` prefix, or an empty string for missing values.
 */
function datePrefix(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}
