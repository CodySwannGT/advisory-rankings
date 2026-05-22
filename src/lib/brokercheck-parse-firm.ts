// @ts-nocheck
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
  const bi = content.basicInformation ?? {};
  const firmFinraId = String(bi.firmId ?? "");
  const addr = content.firmAddressDetails?.officeAddress ?? {};
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
  const owners = (content.directOwners ?? []).map(owner => ({
    name: owner.legalName,
    position: owner.position,
    crd: owner.crdNumber ?? null,
    scope: owner.bcScope ?? null,
  }));
  const discCounts = Object.fromEntries(
    (content.disclosures ?? []).map(disclosure => [
      disclosure.disclosureType,
      disclosure.disclosureCount,
    ])
  );
  const regs = content.registrations ?? {};
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
      branchCount: bi.firm_branches_count ?? content.firm_branches_count ?? 0,
      stateRegistrationCount: regs.approvedStateRegistrationCount ?? 0,
    },
  };
}
