import type { BrokerRecord } from "./brokercheck-parse.js";
import { title, toIsoDate } from "./brokercheck-parse-shared.js";
import type { FirmRow } from "../types/harper-schema.js";

/** BrokerCheck firm `basicInformation` payload fields used by this parser. */
interface BrokerCheckFirmBasicInformation {
  readonly bcScope?: string | null;
  readonly bdSECNumber?: string | null;
  readonly finraLastApprovalDate?: string | null;
  readonly firm_branches_count?: number | null;
  readonly firmId?: string | number | null;
  readonly firmName?: string | null;
  readonly firmStatus?: string | null;
  readonly firmType?: string | null;
  readonly iaFirmName?: string | null;
  readonly iaScope?: string | null;
  readonly iaSECNumber?: string | null;
  readonly otherNames?: readonly string[];
}

/** BrokerCheck firm office address fields used for headquarters mapping. */
interface BrokerCheckFirmAddress {
  readonly city?: string | null;
  readonly country?: string | null;
  readonly state?: string | null;
}

/** BrokerCheck firm address-details wrapper emitted by firm profiles. */
interface BrokerCheckFirmAddressDetails {
  readonly officeAddress?: BrokerCheckFirmAddress;
}

/** BrokerCheck direct-owner payload fields emitted by firm profiles. */
interface BrokerCheckFirmOwner {
  readonly bcScope?: string | null;
  readonly crdNumber?: string | number | null;
  readonly legalName?: string | null;
  readonly position?: string | null;
}

/** BrokerCheck disclosure-count payload fields emitted by firm profiles. */
interface BrokerCheckFirmDisclosure {
  readonly disclosureCount?: number | null;
  readonly disclosureType?: string;
}

/** BrokerCheck firm registration-count payload fields used in summaries. */
interface BrokerCheckFirmRegistrations {
  readonly approvedStateRegistrationCount?: number | null;
}

/** Sparse BrokerCheck firm profile payload consumed by `parseFirm`. */
interface BrokerCheckFirmPayload extends BrokerRecord {
  readonly basicInformation?: BrokerCheckFirmBasicInformation;
  readonly disclosures?: readonly BrokerCheckFirmDisclosure[];
  readonly directOwners?: readonly BrokerCheckFirmOwner[];
  readonly firm_branches_count?: number | null;
  readonly firmAddressDetails?: BrokerCheckFirmAddressDetails;
  readonly registrations?: BrokerCheckFirmRegistrations;
}

/**
 * Parsed firm fields that callers inspect after firm parsing.
 */
interface ParsedFirmRow extends BrokerRecord {
  readonly finraCrd?: FirmRow["finraCrd"] | null;
  readonly hqCity?: FirmRow["hqCity"] | null;
  readonly hqCountry?: FirmRow["hqCountry"] | null;
  readonly hqState?: FirmRow["hqState"] | null;
  readonly legalName?: FirmRow["legalName"] | null;
  readonly name?: FirmRow["name"] | null;
  readonly secFilerId?: FirmRow["secFilerId"] | null;
}

/**
 * Parsed firm payload consumed by the BrokerCheck loader.
 */
interface ParsedFirm extends BrokerRecord {
  readonly firm: ParsedFirmRow;
}

/**
 * Parses a BrokerCheck firm payload into firm, owner, succession, and summary rows.
 * @param content - BrokerCheck firm payload.
 * @returns Parsed firm rows and summary metadata.
 */
export function parseFirm(content: BrokerRecord): ParsedFirm {
  if (!content)
    return {
      firm: {},
      other_names: [],
      successions: [],
      owners: [],
      summary: {},
    };
  const payload = content as BrokerCheckFirmPayload;
  const bi = payload.basicInformation ?? {};
  const firmFinraId = String(bi.firmId ?? "");
  const addr = payload.firmAddressDetails?.officeAddress ?? {};
  const firm = {
    finraCrd: firmFinraId,
    name: bi.firmName ? title(bi.firmName)?.replaceAll("Llc", "LLC") : null,
    legalName: bi.firmName ?? null,
    _iaFirmName: bi.iaFirmName ?? null,
    _bdSecNumber: bi.bdSECNumber ?? null,
    _iaSecNumber: bi.iaSECNumber ?? null,
    secFilerId: bi.bdSECNumber ?? bi.iaSECNumber ?? null,
    _firmType: bi.firmType ?? null,
    _firmStatus: bi.firmStatus ?? null,
    _finraLastApprovalDate: toIsoDate(bi.finraLastApprovalDate),
    hqCity: title(addr.city),
    hqState: addr.state ?? null,
    hqCountry: addr.country ?? null,
  };
  const otherNames = [...(bi.otherNames ?? [])];
  const successions = otherNames
    .filter(
      name =>
        name && name.toUpperCase() !== String(bi.firmName ?? "").toUpperCase()
    )
    .map(name => ({
      _priorName: name,
      _currentName: bi.firmName,
      type: "name_change",
    }));
  const owners = (payload.directOwners ?? []).map(owner => ({
    name: owner.legalName,
    position: owner.position,
    crd: owner.crdNumber ?? null,
    scope: owner.bcScope ?? null,
  }));
  const discCounts: Readonly<Record<string, number | null | undefined>> =
    Object.fromEntries(
      (payload.disclosures ?? []).map(disclosure => [
        disclosure.disclosureType,
        disclosure.disclosureCount,
      ])
    );
  const regs = payload.registrations ?? {};
  return {
    firm,
    other_names: otherNames,
    successions,
    owners,
    summary: {
      bcScope: bi.bcScope ?? "",
      iaScope: bi.iaScope ?? "",
      regulatoryDisclosureCount: discCounts["Regulatory Event"] ?? 0,
      arbitrationCount: discCounts.Arbitration ?? 0,
      civilCount: discCounts["Civil Event"] ?? 0,
      branchCount: bi.firm_branches_count ?? payload.firm_branches_count ?? 0,
      stateRegistrationCount: regs.approvedStateRegistrationCount ?? 0,
    },
  };
}
