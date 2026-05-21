import { v5 as uuidv5 } from "uuid";

export const NS = "8c4e2f1d-3b9a-4f87-9e62-2bf7b1a0c5d3";

export function uid(label: string): string {
  return uuidv5(label, NS);
}

export function slugify(value: string): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function firmId(canonicalName: string): string {
  return uid(`firm:${slugify(canonicalName)}`);
}

export function articleId(urlOrWpId: string): string {
  return uid(`article:${urlOrWpId}`);
}

export function advisorId(legalName: string, hint = ""): string {
  const parts = [slugify(legalName)];
  if (hint) parts.push(slugify(hint));
  return uid(`advisor:${parts.join(":")}`);
}

export function teamId(name: string, firmCanonical = ""): string {
  const parts = [slugify(name)];
  if (firmCanonical) parts.push(slugify(firmCanonical));
  return uid(`team:${parts.join(":")}`);
}

export function branchId(
  firmCanonical: string,
  level: string,
  name: string
): string {
  return uid(`branch:${slugify(firmCanonical)}:${level}:${slugify(name)}`);
}

export function transitionEventId(
  subjectId: string,
  fromFirmId: string,
  toFirmId: string,
  moveDate = ""
): string {
  return uid(`te:${subjectId}:${fromFirmId}:${toFirmId}:${moveDate}`);
}

export function disclosureId(
  advisorIdValue: string,
  disclosureType: string,
  dateKey = "",
  regulator = ""
): string {
  return uid(
    `disc:${advisorIdValue}:${disclosureType}:${dateKey}:${regulator}`
  );
}

export function employmentHistoryId(
  advisorIdValue: string,
  firmIdValue: string,
  startDate = ""
): string {
  return uid(`eh:${advisorIdValue}:${firmIdValue}:${startDate}`);
}

export function teamMembershipId(
  teamIdValue: string,
  advisorIdValue: string
): string {
  return uid(`tm:${teamIdValue}:${advisorIdValue}`);
}

export function metricSnapshotId(
  subjectId: string,
  asOf: string,
  sourceType = ""
): string {
  return uid(`snap:${subjectId}:${asOf}:${sourceType}`);
}

export function sanctionId(
  disclosureIdValue: string,
  sanctionType: string,
  amount = "",
  duration = ""
): string {
  return uid(`sanc:${disclosureIdValue}:${sanctionType}:${amount}:${duration}`);
}
