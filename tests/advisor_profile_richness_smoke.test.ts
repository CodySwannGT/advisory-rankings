import { describe, expect, it } from "vitest";

const DEV_BACKEND =
  process.env.ADVISOR_PROFILE_RICHNESS_BACKEND ||
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const RUN_ENABLED = process.env.RUN_ADVISOR_PROFILE_RICHNESS_SMOKE === "1";
const EXCLUDED_SEED_FIRMS = ["morgan stanley", "wells fargo"];
const describeIf = RUN_ENABLED ? describe.sequential : describe.skip;
const REPRESENTATIVE_PROFILE_IDS = [
  "23ba6df6-94e1-58e4-9a5d-e1fbe17435a0",
  "cc0e3d67-0e64-5a44-b0ac-809b37d01863",
  "4110f1f8-19fb-5266-9eb0-ad9c056faec7",
  "2016bd11-4496-53cb-a185-a2f7935cdde5",
  "5d0fd042-5c14-56ea-8973-481520a1b7c0",
  "53e749e0-3bd5-5d90-9d03-cb088bf054e2",
  "56c3e066-11c8-5af5-bd7e-3a22c3d8d6aa",
  "a9dc9844-88bb-5f4c-9d1a-7554446c7821",
  "6cbe048c-88d4-527e-975f-57c717cfa249",
  "b0b784db-09b2-5468-8cd7-95cfa9aa7e99",
] as const;

interface AdvisorProfilePayload {
  readonly advisor?: {
    readonly bioText?: string | null;
    readonly businessEmail?: string | null;
    readonly businessPhone?: string | null;
    readonly finraCrd?: string | null;
    readonly headshotUrl?: string | null;
    readonly legalName?: string | null;
  };
  readonly articles?: readonly unknown[];
  readonly brokerCheckSnapshot?: unknown;
  readonly career?: readonly AdvisorCareerRow[];
  readonly displayName?: string;
  readonly evidenceFreshness?: {
    readonly hasData?: boolean;
    readonly statusCounts?: Partial<Record<ResearchStatus, number>>;
  };
  readonly teams?: readonly AdvisorTeamRow[];
}

interface AdvisorCareerRow {
  readonly endDate?: unknown;
  readonly firm?: FirmChip | null;
  readonly roleTitle?: string | null;
}

interface AdvisorTeamRow {
  readonly team?: { readonly firm?: FirmChip | null } | null;
}

interface FirmChip {
  readonly name?: string | null;
  readonly short?: string | null;
}

type ResearchStatus = "success" | "no_new_data" | "ambiguous" | "failed";

interface RichnessSample {
  readonly firm: string;
  readonly id: string;
  readonly name: string;
  readonly richnessFields: readonly string[];
  readonly sourceLimitation: boolean;
}

describeIf("advisor profile richness smoke (#947)", () => {
  it("finds ten non-seed advisor profiles with current firm and source-backed depth", async () => {
    const samples: RichnessSample[] = [];
    for (const id of REPRESENTATIVE_PROFILE_IDS) {
      samples.push(await profileSample(id));
    }

    expect(samples, sampleSummary(samples)).toHaveLength(10);
    for (const sample of samples) {
      expect(sample.firm, sample.name).not.toEqual("");
      expect(isSeedFirm(sample.firm), sample.name).toBe(false);
      expect(
        sample.richnessFields.length >= 2 || sample.sourceLimitation,
        sampleSummary([sample])
      ).toBe(true);
    }
  }, 120_000);
});

async function jsonGet<T>(path: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${DEV_BACKEND}${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      expect(response.ok, `${path} returned ${response.status}`).toBe(true);
      return (await response.json()) as T;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${path} did not return a response`);
}

async function profileSample(id: string): Promise<RichnessSample> {
  const profile = await jsonGet<AdvisorProfilePayload>(`/AdvisorProfile/${id}`);
  const firm = currentFirm(profile);
  return {
    firm,
    id,
    name:
      profile.displayName ||
      profile.advisor?.legalName ||
      `AdvisorProfile/${id}`,
    richnessFields: richnessFields(profile),
    sourceLimitation: hasSourceLimitation(profile),
  };
}

function currentFirm(profile: AdvisorProfilePayload): string {
  const activeCareer = (profile.career ?? []).find(row => !row.endDate);
  const careerFirm = firmName(activeCareer?.firm);
  if (careerFirm) return careerFirm;
  const teamFirm = (profile.teams ?? [])
    .map(row => firmName(row.team?.firm))
    .find(Boolean);
  return teamFirm ?? "";
}

function firmName(firm: FirmChip | null | undefined): string {
  return firm?.name || firm?.short || "";
}

function isSeedFirm(firm: string): boolean {
  const normalized = firm.toLowerCase();
  return EXCLUDED_SEED_FIRMS.some(seedFirm => normalized.includes(seedFirm));
}

function richnessFields(profile: AdvisorProfilePayload): readonly string[] {
  const fields: string[] = [];
  addRichnessField(fields, profile.advisor?.headshotUrl, "headshot");
  addRichnessField(
    fields,
    profile.advisor?.bioText || currentRoleTitle(profile),
    "title/bio"
  );
  addRichnessField(
    fields,
    profile.advisor?.businessEmail || profile.advisor?.businessPhone,
    "contact"
  );
  addRichnessField(
    fields,
    profile.advisor?.finraCrd || profile.brokerCheckSnapshot,
    "crd/brokercheck"
  );
  addRichnessField(
    fields,
    (profile.career ?? []).length > 1,
    "employment-history"
  );
  addRichnessField(fields, (profile.teams ?? []).length, "team");
  addRichnessField(fields, (profile.articles ?? []).length, "source-coverage");
  addRichnessField(fields, hasSuccessfulSourceCheck(profile), "source-check");
  return fields;
}

function addRichnessField(
  fields: string[],
  value: unknown,
  label: string
): void {
  if (value) fields.push(label);
}

function currentRoleTitle(profile: AdvisorProfilePayload): string {
  return (
    (profile.career ?? []).find(row => !row.endDate)?.roleTitle ||
    (profile.career ?? [])[0]?.roleTitle ||
    ""
  );
}

function hasSuccessfulSourceCheck(profile: AdvisorProfilePayload): boolean {
  const counts = profile.evidenceFreshness?.statusCounts;
  return Boolean(
    profile.evidenceFreshness?.hasData &&
    (counts?.success ?? 0) + (counts?.no_new_data ?? 0) > 0
  );
}

function hasSourceLimitation(profile: AdvisorProfilePayload): boolean {
  const counts = profile.evidenceFreshness?.statusCounts;
  return Boolean((counts?.ambiguous ?? 0) + (counts?.failed ?? 0) > 0);
}

function sampleSummary(samples: readonly RichnessSample[]): string {
  return samples
    .map(
      sample =>
        `${sample.name} (${sample.firm}): ${sample.richnessFields.join(", ") || "no fields"}${sample.sourceLimitation ? "; source limitation" : ""}`
    )
    .join("\n");
}
