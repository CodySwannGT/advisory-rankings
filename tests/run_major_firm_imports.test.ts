import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractModeArtifact,
  runMajorFirmImports,
  summarizeAdapterStatus,
} from "../src/lib/major-firm-imports.js";

const ADVISOR_COUNT = 2;
const TOTAL_ROWS = 3;
const ADA_ADVISOR = { id: "advisor-1", name: "Ada Advisor" };
const STATUS_WRITE_BLOCKED = "write-blocked";
const STATUS_SOURCE_LIMITED = "source-limited";
type AdapterModeArtifact = ReturnType<typeof extractModeArtifact>;
type AdapterMode = AdapterModeArtifact["mode"];

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map(dir => rm(dir, { recursive: true, force: true }))
  );
  tempDirs.length = 0;
});

describe("major firm import runner", () => {
  it("writes per-adapter artifacts and a summary for bounded write runs", async () => {
    const outputDir = await tempDir();
    const summary = await runMajorFirmImports(
      {
        checkedAt: "2026-06-06",
        maxAdvisors: 5,
        outputDir,
        sampleLimit: 1,
        write: true,
      },
      async (_command, args) => {
        const isWrite = args.includes("--write");
        const script = args.find(value => value.endsWith(".js")) ?? "";
        if (script.includes("scrape_ubs") && !isWrite) {
          throw Object.assign(new Error("UBS search returned HTTP 403"), {
            stdout: "",
            stderr: "blocked by source",
          });
        }
        if (script.includes("scrape_rbc") && isWrite) {
          throw Object.assign(new Error("Harper admin credentials missing"), {
            stdout: "",
            stderr: "missing credentials",
          });
        }
        return {
          stdout: JSON.stringify(fakeAdapterPayload(isWrite)),
          stderr: `[${path.basename(script)}] attempted`,
        };
      }
    );

    expect(summary.adapters).toHaveLength(8);
    expect(
      summary.adapters.find(adapter => adapter.slug === "rbc")
    ).toMatchObject({
      status: STATUS_WRITE_BLOCKED,
      dryRunRows: 3,
      writeTouched: 0,
    });
    expect(
      summary.adapters.find(adapter => adapter.slug === "ubs")
    ).toMatchObject({
      status: "blocked",
      dryRunRows: 0,
    });
    const morganStanleyArtifact = JSON.parse(
      await readFile(path.join(outputDir, "morgan-stanley.json"), "utf8")
    ) as { dryRun: AdapterModeArtifact };
    expect(morganStanleyArtifact.dryRun.sampleRows.Advisor).toEqual([
      ADA_ADVISOR,
    ]);
    expect(
      JSON.parse(await readFile(path.join(outputDir, "summary.json"), "utf8"))
    ).toMatchObject({ checkedAt: "2026-06-06", write: true });
  });

  it("extracts counts and sampled rows from adapter JSON stdout", () => {
    const artifact = extractModeArtifact(
      "dry-run",
      ["node", MERRILL_SCRIPT],
      `noise\n${JSON.stringify(fakeAdapterPayload(false))}\n`,
      "fetch log",
      1
    );

    expect(artifact.ok).toBe(true);
    expect(artifact.totalRows).toBe(TOTAL_ROWS);
    expect(artifact.totalTouched).toBe(TOTAL_ROWS);
    expect(artifact.sampleRows).toEqual({
      Advisor: [{ id: "advisor-1", name: "Ada Advisor" }],
      Firm: [{ id: "firm-1", name: "Example Firm" }],
    });
  });

  it("classifies source-limited and write-blocked adapter outcomes", () => {
    const zeroDryRun = modeArtifact("dry-run", true, 0, 0);
    const mappedDryRun = modeArtifact("dry-run", true, TOTAL_ROWS, TOTAL_ROWS);
    const failedDryRun = modeArtifact("dry-run", false, 0, 0);
    const failedWrite = modeArtifact("write", false, 0, 0);
    const zeroWrite = modeArtifact("write", true, 0, 0);
    const touchedWrite = modeArtifact("write", true, TOTAL_ROWS, TOTAL_ROWS);

    expect(summarizeAdapterStatus(zeroDryRun, undefined)).toBe(
      STATUS_SOURCE_LIMITED
    );
    expect(summarizeAdapterStatus(mappedDryRun, undefined)).toBe("mapped");
    expect(summarizeAdapterStatus(failedDryRun, undefined)).toBe("blocked");
    expect(summarizeAdapterStatus(mappedDryRun, failedWrite)).toBe(
      STATUS_WRITE_BLOCKED
    );
    expect(summarizeAdapterStatus(mappedDryRun, zeroWrite)).toBe(
      STATUS_WRITE_BLOCKED
    );
    expect(summarizeAdapterStatus(zeroDryRun, zeroWrite)).toBe(
      STATUS_SOURCE_LIMITED
    );
    expect(summarizeAdapterStatus(mappedDryRun, touchedWrite)).toBe("written");
  });
});

const tempDir = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "major-firm-imports-"));
  tempDirs.push(dir);
  return dir;
};

const fakeAdapterPayload = (write: boolean): unknown => ({
  write,
  counts: { Firm: 1, Advisor: ADVISOR_COUNT },
  touchedCounts: { Firm: 1, Advisor: ADVISOR_COUNT },
  rows: {
    Firm: [{ id: "firm-1", name: "Example Firm" }],
    Advisor: [ADA_ADVISOR, { id: "advisor-2", name: "Grace Advisor" }],
  },
});

const modeArtifact = (
  mode: AdapterMode,
  ok: boolean,
  totalRows: number,
  totalTouched: number
): AdapterModeArtifact => ({
  mode,
  command: ["node", "script.js"],
  ok,
  stdout: "",
  stderr: "",
  counts: totalRows > 0 ? { Advisor: totalRows } : {},
  touchedCounts: totalTouched > 0 ? { Advisor: totalTouched } : {},
  totalRows,
  totalTouched,
  sampleRows: {},
});

const MERRILL_SCRIPT = "dist/scripts/scrape_merrill.js";
