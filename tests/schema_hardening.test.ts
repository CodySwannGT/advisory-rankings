import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import seedData from "../src/data/seed-data.json" with { type: "json" };

import {
  reindexAdvisorTokens,
  type AdvisorSearchIndexHandle,
  type AdvisorSearchIndexRow,
} from "../src/lib/advisor-search-index.js";
import { type AdvisorRow } from "../src/lib/advisor-tokens.js";
import { buildRows } from "../src/scripts/load_extractions.js";

const schema = readFileSync(
  new URL("../harper-app/schema.graphql", import.meta.url),
  "utf8"
);
const EXAMPLE_WEALTH = "Example Wealth";
const ALEX_EXAMPLE = "Alex Example";

const sealedTables = [
  "AdvisorSearchIndex",
  "ArticleAdvisorMention",
  "ArticleFirmMention",
  "ArticleTeamMention",
  "ArticleTransitionEventMention",
  "ArticleDisclosureMention",
  "FieldAssertion",
] as const;

type SealedTable = (typeof sealedTables)[number];

const tablePattern = (table: string): RegExp =>
  new RegExp(`type ${table}([^\\{]*)\\{([\\s\\S]*?)\\n\\}`, "u");

const tableMatch = (table: string): RegExpMatchArray => {
  const match = tablePattern(table).exec(schema);
  expect(match, `missing schema table ${table}`).not.toBeNull();
  return match as RegExpMatchArray;
};

const tableDirectives = (table: string): string => tableMatch(table)[1] ?? "";

const tableBody = (table: string): string => tableMatch(table)[2] ?? "";

const declaredFields = (table: string): ReadonlySet<string> =>
  new Set(
    tableBody(table)
      .split("\n")
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith("#"))
      .map(line => line.split(":")[0]?.trim())
      .filter((field): field is string => Boolean(field))
  );

const assertDeclaredKeys = (
  table: SealedTable,
  rows: readonly Readonly<Record<string, unknown>>[]
): void => {
  const fields = declaredFields(table);
  const undeclared = rows.flatMap(row =>
    Object.keys(row)
      .filter(key => !fields.has(key))
      .map(key => `${table}.${key}`)
  );
  expect(undeclared).toEqual([]);
};

const extractionFixtureRows = (): Readonly<
  Record<string, readonly Readonly<Record<string, unknown>>[]>
> =>
  buildRows({
    article: {
      url: "https://www.advisorhub.com/schema-hardening-fixture/",
      headline: "Schema hardening fixture",
    },
    firms: [
      {
        natural_key: { canonical_name: EXAMPLE_WEALTH },
        fields: { channel: "ria" },
      },
    ],
    advisors: [
      {
        natural_key: {
          legal_name: ALEX_EXAMPLE,
          first_employer: EXAMPLE_WEALTH,
        },
        fields: {
          firstName: "Alex",
          lastName: "Example",
        },
      },
    ],
    disclosures: [
      {
        local_key: "disc-1",
        advisor_legal_name: ALEX_EXAMPLE,
        natural_key: {
          disclosure_type: "Customer Dispute",
          regulator: "FINRA",
        },
        fields: {
          disclosureType: "Customer Dispute",
          dateInitiated: "2026-01-01",
          regulator: "FINRA",
        },
      },
    ],
    transition_events: [
      {
        local_key: "move-1",
        subject_advisor_legal_name: ALEX_EXAMPLE,
        from_firm_canonical_name: EXAMPLE_WEALTH,
        to_firm_canonical_name: EXAMPLE_WEALTH,
        fields: { moveDate: "2026-01-02" },
      },
    ],
    field_assertions: [
      {
        target_table: "Advisor",
        target_ref: ALEX_EXAMPLE,
        field: "aum",
        value: "$1B",
        quote: "$1B in assets",
        confidence: "asserted",
      },
    ],
  }) as Readonly<Record<string, readonly Readonly<Record<string, unknown>>[]>>;

const advisorSearchIndexRows = async (): Promise<
  readonly AdvisorSearchIndexRow[]
> => {
  const rows: AdvisorSearchIndexRow[] = [];
  const advisor: AdvisorRow = {
    id: "advisor-1",
    legalName: ALEX_EXAMPLE,
    firstName: "Alex",
    lastName: "Example",
    preferredName: null,
  };
  const handle: AdvisorSearchIndexHandle = {
    getAdvisor: async () => advisor,
    listTokensForAdvisor: async () => [],
    upsertTokens: async nextRows => {
      rows.push(...nextRows);
    },
    deleteTokens: async () => {},
  };

  await reindexAdvisorTokens(handle, [advisor.id]);
  return rows;
};

describe("schema hardening", () => {
  it("seals the low-risk junction and append-only tables", () => {
    expect(
      sealedTables.filter(table => !tableDirectives(table).includes("@sealed"))
    ).toEqual([]);
  });

  it("keeps AdvisorMetricSnapshot timestamp parity with TeamMetricSnapshot", () => {
    expect(tableBody("TeamMetricSnapshot")).toContain(
      "createdAt: Date @createdTime"
    );
    expect(tableBody("AdvisorMetricSnapshot")).toContain(
      "createdAt: Date @createdTime"
    );
  });

  it("keeps seeded and loader-emitted rows within sealed table fields", async () => {
    const loaderRows = extractionFixtureRows();
    const advisorIndexRows = await advisorSearchIndexRows();
    const rowsByTable: Readonly<
      Record<SealedTable, readonly Readonly<Record<string, unknown>>[]>
    > = {
      AdvisorSearchIndex: advisorIndexRows,
      ArticleAdvisorMention: [
        ...seedData.ArticleAdvisorMention,
        ...(loaderRows.ArticleAdvisorMention ?? []),
      ],
      ArticleFirmMention: [
        ...seedData.ArticleFirmMention,
        ...(loaderRows.ArticleFirmMention ?? []),
      ],
      ArticleTeamMention: seedData.ArticleTeamMention,
      ArticleTransitionEventMention: [
        ...seedData.ArticleTransitionEventMention,
        ...(loaderRows.ArticleTransitionEventMention ?? []),
      ],
      ArticleDisclosureMention: [
        ...seedData.ArticleDisclosureMention,
        ...(loaderRows.ArticleDisclosureMention ?? []),
      ],
      FieldAssertion: [
        ...seedData.FieldAssertion,
        ...(loaderRows.FieldAssertion ?? []),
      ],
    };

    sealedTables.forEach(table =>
      assertDeclaredKeys(table, rowsByTable[table])
    );
  });
});
