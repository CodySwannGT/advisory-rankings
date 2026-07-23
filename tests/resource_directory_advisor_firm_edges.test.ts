import { afterEach, describe, expect, it } from "vitest";
import { advisorsMatchingFirm } from "../src/harper/resource-directory-advisor-firm.js";
import type {
  AdvisorRow,
  EmploymentHistoryRow,
  FirmRow,
} from "../src/types/harper-schema.js";

interface SearchQuery {
  readonly conditions?: ReadonlyArray<{
    readonly attribute: string;
    readonly value: string;
  }>;
}

interface TestTable<T> {
  readonly queries: SearchQuery[];
  readonly table: {
    readonly search: (query: SearchQuery) => AsyncIterable<T>;
  };
}

const globals = globalThis as { tables?: Record<string, unknown> };
const previousTables = globals.tables;
const ACTIVE = "active";
const ADVISOR_CURRENT = "advisor-current";
const ADVISOR_ENDED = "advisor-ended";
const ADVISOR_FILTERED = "advisor-filtered";
const ALPHA_WEALTH = "Alpha Wealth";
const ALPHA_WEALTH_QUERY = "alpha wealth";
const FIRM_ALPHA = "firm-alpha";
const WIREHOUSE = "wirehouse";

afterEach(() => {
  globals.tables = previousTables;
});

describe("advisor firm directory lookup", () => {
  it("uses bounded firm lookups, ignores ended employments, and de-dupes advisors", async () => {
    const firms = Array.from({ length: 26 }, (_, index): FirmRow => {
      const padded = String(index + 1).padStart(2, "0");
      return {
        id: `firm-${padded}`,
        name: `Alpha Wealth ${padded}`,
        channel: WIREHOUSE,
      };
    });
    const advisors: AdvisorRow[] = [
      {
        id: ADVISOR_CURRENT,
        legalName: "Current Advisor",
        careerStatus: ACTIVE,
        finraCrd: "123",
      },
      {
        id: ADVISOR_ENDED,
        legalName: "Ended Advisor",
        careerStatus: ACTIVE,
        finraCrd: "456",
      },
      {
        id: ADVISOR_FILTERED,
        legalName: "Filtered Advisor",
        careerStatus: "retired",
        finraCrd: "789",
      },
    ];
    const employments: EmploymentHistoryRow[] = [
      {
        id: "employment-current-a",
        advisorId: ADVISOR_CURRENT,
        firmId: "firm-01",
      },
      {
        id: "employment-current-b",
        advisorId: ADVISOR_CURRENT,
        firmId: "firm-02",
      },
      {
        id: "employment-ended",
        advisorId: ADVISOR_ENDED,
        firmId: "firm-03",
        endDate: "2024-01-01",
      },
      {
        id: "employment-filtered",
        advisorId: ADVISOR_FILTERED,
        firmId: "firm-04",
      },
    ];
    const firmTable = createTable(firms);
    const employmentTable = createTable(employments);
    const advisorTable = createTable(advisors);
    globals.tables = {
      Firm: firmTable.table,
      EmploymentHistory: employmentTable.table,
      Advisor: advisorTable.table,
    };

    await expect(
      advisorsMatchingFirm(
        {
          q: null,
          firm: ALPHA_WEALTH_QUERY,
          careerStatus: ACTIVE,
          hasCrd: true,
          contactReadiness: null,
          profileSubstance: null,
          freshness: null,
        },
        ALPHA_WEALTH_QUERY
      )
    ).resolves.toEqual([advisors[0]]);
    expect(employmentTable.queries.filter(hasConditions)).toHaveLength(26);
    expect(advisorTable.queries.filter(hasConditions)).toEqual([
      { conditions: [{ attribute: "id", value: ADVISOR_CURRENT }] },
      { conditions: [{ attribute: "id", value: ADVISOR_FILTERED }] },
    ]);
  });

  it("wraps indexed employment lookup failures with firm-filter context", async () => {
    globals.tables = {
      Firm: createTable([
        { id: FIRM_ALPHA, name: ALPHA_WEALTH, channel: WIREHOUSE },
      ] satisfies FirmRow[]).table,
      EmploymentHistory: failingTable("index unavailable").table,
      Advisor: createTable([] satisfies AdvisorRow[]).table,
    };

    const error = await advisorsMatchingFirm(
      {
        q: null,
        firm: ALPHA_WEALTH_QUERY,
        careerStatus: null,
        hasCrd: null,
        contactReadiness: null,
        profileSubstance: null,
        freshness: null,
      },
      ALPHA_WEALTH_QUERY
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Failed to resolve advisor firm filter"
    );
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error).message).toBe("index unavailable");
  });

  it("returns no advisors when matching firms only have ended employment", async () => {
    const advisorTable = createTable([] satisfies AdvisorRow[]);
    globals.tables = {
      Firm: createTable([
        { id: FIRM_ALPHA, name: ALPHA_WEALTH, channel: WIREHOUSE },
      ] satisfies FirmRow[]).table,
      EmploymentHistory: createTable([
        {
          id: "employment-ended",
          advisorId: ADVISOR_ENDED,
          firmId: FIRM_ALPHA,
          endDate: "2024-01-01",
        },
      ] satisfies EmploymentHistoryRow[]).table,
      Advisor: advisorTable.table,
    };

    await expect(
      advisorsMatchingFirm(
        {
          q: null,
          firm: ALPHA_WEALTH_QUERY,
          careerStatus: null,
          hasCrd: null,
          contactReadiness: null,
          profileSubstance: null,
          freshness: null,
        },
        ALPHA_WEALTH_QUERY
      )
    ).resolves.toEqual([]);
    expect(advisorTable.queries).toEqual([]);
  });

  it("normalizes non-error indexed lookup failures into error causes", async () => {
    globals.tables = {
      Firm: createTable([
        { id: FIRM_ALPHA, name: ALPHA_WEALTH, channel: WIREHOUSE },
      ] satisfies FirmRow[]).table,
      EmploymentHistory: throwingTable("employment index unavailable").table,
      Advisor: createTable([] satisfies AdvisorRow[]).table,
    };

    const employmentError = await advisorsMatchingFirm(
      emptyFilters(),
      ALPHA_WEALTH_QUERY
    ).catch((caught: unknown) => caught);

    expect((employmentError as Error).message).toBe(
      "Failed to resolve advisor firm filter"
    );
    expect(((employmentError as Error).cause as Error).message).toBe(
      "employment index unavailable"
    );

    globals.tables = {
      Firm: createTable([
        { id: FIRM_ALPHA, name: ALPHA_WEALTH, channel: WIREHOUSE },
      ] satisfies FirmRow[]).table,
      EmploymentHistory: createTable([
        {
          id: "employment-current",
          advisorId: ADVISOR_CURRENT,
          firmId: FIRM_ALPHA,
        },
      ] satisfies EmploymentHistoryRow[]).table,
      Advisor: throwingTable("advisor index unavailable").table,
    };

    const advisorError = await advisorsMatchingFirm(
      emptyFilters(),
      ALPHA_WEALTH_QUERY
    ).catch((caught: unknown) => caught);

    expect((advisorError as Error).message).toBe(
      "Failed to load advisors for firm filter"
    );
    expect(((advisorError as Error).cause as Error).message).toBe(
      "advisor index unavailable"
    );
  });
});

function createTable<T extends Record<string, unknown>>(
  rows: ReadonlyArray<T>
): TestTable<T> {
  const queries: SearchQuery[] = [];
  return {
    queries,
    table: {
      async *search(query: SearchQuery): AsyncIterable<T> {
        queries.push(query);
        const [condition] = query.conditions ?? [];
        for (const row of rows) {
          if (!condition || row[condition.attribute] === condition.value) {
            yield row;
          }
        }
      },
    },
  };
}

function failingTable(message: string): TestTable<Record<string, unknown>> {
  const queries: SearchQuery[] = [];
  return {
    queries,
    table: {
      search(query: SearchQuery): AsyncIterable<Record<string, unknown>> {
        queries.push(query);
        return throwingIterable(new Error(message));
      },
    },
  };
}

function throwingTable(message: string): TestTable<Record<string, unknown>> {
  const queries: SearchQuery[] = [];
  return {
    queries,
    table: {
      search(query: SearchQuery): AsyncIterable<Record<string, unknown>> {
        queries.push(query);
        return throwingIterable(message);
      },
    },
  };
}

function emptyFilters() {
  return {
    q: null,
    firm: ALPHA_WEALTH_QUERY,
    careerStatus: null,
    hasCrd: null,
    contactReadiness: null,
    profileSubstance: null,
    freshness: null,
  };
}

function hasConditions(query: SearchQuery): boolean {
  return Boolean(query.conditions?.length);
}

function throwingIterable(
  reason: unknown
): AsyncIterable<Record<string, unknown>> {
  return {
    [Symbol.asyncIterator]() {
      return {
        next: () => Promise.reject(reason),
      };
    },
  };
}
