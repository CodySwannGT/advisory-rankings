import { describe, expect, it } from "vitest";

const DEV_BACKEND =
  process.env.FIRM_PROFILE_RICHNESS_BACKEND ||
  "https://advisory-rankings-de.cody-swann-org.harperfabric.com";
const RUN_ENABLED = process.env.RUN_FIRM_PROFILE_RICHNESS_SMOKE === "1";
const describeIf = RUN_ENABLED ? describe.sequential : describe.skip;

const REPRESENTATIVE_FIRMS = [
  {
    id: "8e106b7e-efcc-5aed-8827-fd0ea645b6df",
    label: "Morgan Stanley",
    namePattern: /Morgan Stanley/i,
  },
  {
    id: "5da49e6c-adb7-5d75-b84f-fb36dd2d887d",
    label: "Wells Fargo Advisors",
    namePattern: /Wells Fargo Advisors/i,
  },
  {
    id: "04798db4-2888-5a57-b635-03a1966482a6",
    label: "Merrill Lynch",
    namePattern: /Merrill Lynch/i,
  },
  {
    id: "6366c339-1f07-5695-8b53-0023f174e201",
    label: "RBC",
    namePattern: /Rbc/i,
  },
  {
    id: "e0582f20-3226-59a4-8737-49b57bdcf391",
    label: "Raymond James",
    namePattern: /Raymond James/i,
  },
  {
    id: "98918930-342f-5dcc-97ed-6ca3296c3a6d",
    label: "Edward Jones",
    namePattern: /Edward Jones/i,
  },
  {
    id: "8bb0b5ab-17cc-5288-94f9-eeedc5940ba4",
    label: "Stifel",
    namePattern: /Stifel/i,
  },
  {
    id: "b34e7f24-cd14-5d1e-b9aa-c7a889f7f3ff",
    label: "UBS Wealth Management USA",
    namePattern: /UBS Wealth Management USA/i,
  },
] as const;

const MODULE_NAMES = [
  "recruitingMomentum",
  "rosterFootprint",
  "rankingPresence",
  "regulatorySnapshot",
  "coverageTimeline",
] as const;

type ModuleName = (typeof MODULE_NAMES)[number];
type ModuleStatus = "loaded" | "not_found" | "unavailable";

interface FirmProfilePayload {
  readonly firm?: {
    readonly id?: string;
    readonly name?: string | null;
  };
  readonly dueDiligence?: {
    readonly dataConfidence?: {
      readonly status?: string;
      readonly modules?: readonly ModuleSummary[];
    };
    readonly modules?: Partial<Record<ModuleName, FirmProfileModule>>;
  };
}

interface FirmProfileModule {
  readonly note?: string | null;
  readonly provenance?: unknown;
  readonly status?: ModuleStatus;
}

interface ModuleSummary {
  readonly name?: string;
  readonly note?: string | null;
  readonly status?: string;
}

interface FirmRichnessSample {
  readonly id: string;
  readonly label: string;
  readonly loadedModules: readonly string[];
  readonly limitationModules: readonly string[];
  readonly moduleNotes: readonly string[];
  readonly name: string;
}

describeIf("firm profile richness smoke (#946)", () => {
  it("shows loaded modules or explicit limitations for representative target firms", async () => {
    const samples: FirmRichnessSample[] = [];
    for (const firm of REPRESENTATIVE_FIRMS) {
      samples.push(await firmProfileSample(firm));
    }

    expect(samples, sampleSummary(samples)).toHaveLength(
      REPRESENTATIVE_FIRMS.length
    );
    for (const sample of samples) {
      expect(
        sample.loadedModules.length + sample.limitationModules.length,
        sampleSummary([sample])
      ).toBe(MODULE_NAMES.length);
      expect(sample.moduleNotes.length, sampleSummary([sample])).toBe(
        MODULE_NAMES.length
      );
      expect(
        sample.loadedModules.length > 0 || sample.limitationModules.length > 0,
        sampleSummary([sample])
      ).toBe(true);
    }
  }, 120_000);
});

async function firmProfileSample(
  firm: (typeof REPRESENTATIVE_FIRMS)[number]
): Promise<FirmRichnessSample> {
  const profile = await jsonGet<FirmProfilePayload>(`/FirmProfile/${firm.id}`);
  const modules = profile.dueDiligence?.modules ?? {};
  const sample: FirmRichnessSample = {
    id: firm.id,
    label: firm.label,
    loadedModules: MODULE_NAMES.filter(
      moduleName => modules[moduleName]?.status === "loaded"
    ),
    limitationModules: MODULE_NAMES.filter(moduleName =>
      isLimitationStatus(modules[moduleName]?.status)
    ),
    moduleNotes: MODULE_NAMES.map(moduleName => modules[moduleName]?.note || "")
      .map(note => note.trim())
      .filter(Boolean),
    name: profile.firm?.name || "",
  };

  expect(sample.name, `${firm.label} resolved name`).toMatch(firm.namePattern);
  expect(
    profile.dueDiligence?.dataConfidence?.modules
      ?.map(row => row.name)
      .sort(alphaCompare),
    `${firm.label} data-confidence module summary`
  ).toEqual([...MODULE_NAMES].sort(alphaCompare));
  return sample;
}

function alphaCompare(left: string | undefined, right: string | undefined) {
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function isLimitationStatus(status: ModuleStatus | undefined): boolean {
  return status === "not_found" || status === "unavailable";
}

async function jsonGet<T>(path: string): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${DEV_BACKEND}${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      expect(response.ok, `${path} returned ${response.status}`).toBe(true);
      return (await response.json()) as T;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`${path} did not return a response`);
}

function sampleSummary(samples: readonly FirmRichnessSample[]): string {
  return samples
    .map(
      sample =>
        `${sample.label} -> ${sample.name || sample.id}: loaded=${sample.loadedModules.join(",") || "none"} limitations=${sample.limitationModules.join(",") || "none"} notes=${sample.moduleNotes.length}`
    )
    .join("\n");
}
