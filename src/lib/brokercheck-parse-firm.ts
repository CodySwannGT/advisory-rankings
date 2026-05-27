import type { BrokerRecord } from "./brokercheck-parse.js";
import { title, toIsoDate } from "./brokercheck-parse-shared.js";

/**
 * Parsed firm fields that callers inspect after firm parsing.
 */
interface ParsedFirmRow extends BrokerRecord {
  readonly name?: string | null;
}

/**
 * Parsed firm payload consumed by the BrokerCheck loader.
 */
interface ParsedFirm extends BrokerRecord {
  readonly firm: ParsedFirmRow;
}

/**
 * BrokerCheck firm office address shape used for headquarters fields.
 */
interface FirmOfficeAddress {
  readonly city?: string | null;
  readonly state?: string | null;
  readonly country?: string | null;
}

/**
 * Basic information block returned by BrokerCheck firm payloads.
 */
interface FirmBasicInformation {
  readonly firmId?: string | number | null;
  readonly firmName?: string | null;
  readonly iaFirmName?: string | null;
  readonly bdSECNumber?: string | null;
  readonly iaSECNumber?: string | null;
  readonly firmType?: string | null;
  readonly firmStatus?: string | null;
  readonly finraLastApprovalDate?: string | null;
  readonly otherNames?: readonly string[];
  readonly bcScope?: string;
  readonly iaScope?: string;
  readonly firm_branches_count?: number;
}

/**
 * Direct owner row from a BrokerCheck firm payload.
 */
interface FirmDirectOwner {
  readonly legalName?: string | null;
  readonly position?: string | null;
  readonly crdNumber?: string | number | null;
  readonly bcScope?: string | null;
}

/**
 * Aggregated disclosure count row attached to a BrokerCheck firm payload.
 */
interface FirmDisclosureSummary {
  readonly disclosureType?: string;
  readonly disclosureCount?: number;
}

/**
 * Registrations block returned by BrokerCheck firm payloads.
 */
interface FirmRegistrations {
  readonly approvedStateRegistrationCount?: number;
}

/**
 * Address details wrapper for BrokerCheck firm payloads.
 */
interface FirmAddressDetails {
  readonly officeAddress?: FirmOfficeAddress;
}

/**
 * Convenience view of a BrokerCheck firm payload used by `parseFirm`.
 */
interface FirmContentView {
  readonly basicInformation?: FirmBasicInformation;
  readonly firmAddressDetails?: FirmAddressDetails;
  readonly directOwners?: readonly FirmDirectOwner[];
  readonly disclosures?: readonly FirmDisclosureSummary[];
  readonly registrations?: FirmRegistrations;
  readonly firm_branches_count?: number;
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
  const view = content as FirmContentView;
  const bi: FirmBasicInformation = view.basicInformation ?? {};
  const firmFinraId = String(bi.firmId ?? "");
  const addr: FirmOfficeAddress = view.firmAddressDetails?.officeAddress ?? {};
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
  const otherNames: readonly string[] = [...(bi.otherNames ?? [])];
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
  const owners = (view.directOwners ?? []).map(owner => ({
    name: owner.legalName,
    position: owner.position,
    crd: owner.crdNumber ?? null,
    scope: owner.bcScope ?? null,
  }));
  const discCounts: Readonly<Record<string, number>> = Object.fromEntries(
    (view.disclosures ?? []).map(disclosure => [
      disclosure.disclosureType ?? "",
      disclosure.disclosureCount ?? 0,
    ])
  );
  const regs: FirmRegistrations = view.registrations ?? {};
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
      branchCount: bi.firm_branches_count ?? view.firm_branches_count ?? 0,
      stateRegistrationCount: regs.approvedStateRegistrationCount ?? 0,
    },
  };
}
