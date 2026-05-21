import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { unwrapFirm, unwrapIndividual } from "../src/lib/brokercheck.js";
import {
  dedupeEmployments,
  normalizeRegulator,
  normalizeResolution,
  normalizeSanctionType,
  parseDurationMonths,
  parseFirm,
  parseIndividual,
  parseMoney,
  toIsoDate,
} from "../src/lib/brokercheck-parse.js";
import { Resolver, hashContent, loadFirm, loadIndividual } from "../src/lib/brokercheck-load.js";

async function fixture(name: string): Promise<any> {
  return JSON.parse(await readFile(new URL(`../research/brokercheck-samples/${name}`, import.meta.url), "utf8"));
}

class StubREST {
  writes: Array<[string, any]> = [];
  readCount = 0;
  writeCount = 0;
  async get() {
    this.readCount++;
    return [];
  }
  async put(table: string, record: any) {
    this.writeCount++;
    this.writes.push([table, { ...record }]);
    return true;
  }
}

describe("BrokerCheck parser", () => {
  it("keeps helper mappings", () => {
    expect(toIsoDate("1/2/2024")).toBe("2024-01-02");
    expect(parseMoney("$2,500.00")).toBe(2500);
    expect(parseDurationMonths("Four months")).toBe(4);
    expect(parseDurationMonths("2 years")).toBe(24);
    expect(normalizeResolution("Acceptance, Waiver & Consent(AWC)")).toEqual(["final", "neither"]);
    expect(normalizeSanctionType("Civil and Administrative Penalty(ies)/Fine(s)")).toBe("fine");
    expect(normalizeRegulator("Texas")).toEqual(["state_securities", "TX"]);
  });

  it("parses Cairnes disclosure-rich fixture", async () => {
    const parsed = parseIndividual(unwrapIndividual(await fixture("cairnes-detail.json")));
    expect(parsed.advisor.finraCrd).toBe("4068906");
    expect(parsed.advisor.legalName).toBe("George John Cairnes");
    expect(parsed.advisor.careerStatus).toBe("withdrawn");
    expect(parsed.employments).toHaveLength(5);
    expect(parsed.disclosures).toHaveLength(6);
    const finra = parsed.disclosures.find((d: any) => d.disclosure.regulator === "FINRA");
    expect(finra.sanctions.find((s: any) => s.sanctionType === "fine").amount).toBe(2500);
    expect(finra.sanctions.find((s: any) => s.sanctionType === "suspension").durationMonths).toBe(4);
    expect(parsed.licenses.map((x: any) => x.licenseType)).toContain("Series_7");
  });

  it("dedupes BD/IA overlap without folding real boomerangs", () => {
    expect(dedupeEmployments([
      { _firmFinraId: "1", _firmName: "A", _iaOnly: false, startDate: "2020-01-01", endDate: "2021-01-01" },
      { _firmFinraId: "1", _firmName: "A", _iaOnly: true, startDate: "2020-01-03", endDate: "2021-01-01" },
    ])).toHaveLength(1);
    expect(dedupeEmployments([
      { _firmFinraId: "1", _firmName: "A", _iaOnly: false, startDate: "2010-01-01", endDate: "2012-01-01" },
      { _firmFinraId: "1", _firmName: "A", _iaOnly: false, startDate: "2018-01-01", endDate: null },
    ])).toHaveLength(2);
  });

  it("parses Wells firm fixture", async () => {
    const parsed = parseFirm(unwrapFirm(await fixture("wf-firm-detail.json")));
    expect(parsed.firm.finraCrd).toBe("19616");
    expect(parsed.firm.hqState).toBe("MO");
    expect(parsed.other_names.length).toBeGreaterThanOrEqual(9);
    expect(parsed.summary.regulatoryDisclosureCount).toBe(184);
    expect(parsed.summary.arbitrationCount).toBe(303);
  });
});

describe("BrokerCheck loader", () => {
  it("is idempotent for deterministic row ids", async () => {
    const content = unwrapIndividual(await fixture("cairnes-detail.json"));
    const parsed = parseIndividual(content);
    const rest1 = new StubREST();
    const rest2 = new StubREST();
    const counts1 = await loadIndividual(parsed, content, { rest: rest1 as any, resolver: new Resolver(rest1 as any), write: true });
    const counts2 = await loadIndividual(parsed, content, { rest: rest2 as any, resolver: new Resolver(rest2 as any), write: true });
    expect(counts1).toEqual(counts2);
    expect(new Set(rest1.writes.map(([t, r]) => `${t}:${r.id}`))).toEqual(
      new Set(rest2.writes.map(([t, r]) => `${t}:${r.id}`))
    );
    expect(rest1.writes.filter(([t]) => t === "BrokerCheckSnapshot")).toHaveLength(1);
    expect(rest1.writes.filter(([t]) => t === "Disclosure").every(([, r]) => r.sourceType === "brokercheck")).toBe(true);
  });

  it("loads firm payload with aggregate disclosure count", async () => {
    const content = unwrapFirm(await fixture("wf-firm-detail.json"));
    const parsed = parseFirm(content);
    const rest = new StubREST();
    await loadFirm(parsed, content, { rest: rest as any, resolver: new Resolver(rest as any), write: true });
    const snapshot = rest.writes.find(([t]) => t === "BrokerCheckSnapshot")?.[1];
    expect(snapshot.subjectKind).toBe("firm");
    expect(snapshot.disclosureCount).toBe(489);
    expect(snapshot.rawHash).toBe(hashContent(content));
  });
});
