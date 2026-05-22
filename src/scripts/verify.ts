#!/usr/bin/env node
import { describeTarget, op, sql } from "../lib/harper.js";

console.error(`[verify] target: ${describeTarget()}`);

/**
 * Harper describe_all payload containing table names as object keys.
 */
interface DescribeAllResult {
  readonly data: Readonly<Record<string, unknown>>;
}

/**
 * COUNT(*) row returned by Harper SQL.
 */
interface CountRow {
  readonly [key: string]: unknown;
  readonly n: number;
}

/**
 * Single identifier row returned by lookup queries.
 */
interface IdRow {
  readonly [key: string]: unknown;
  readonly id: string;
}

/**
 * Returns strings in locale-aware alphabetical order.
 * @param values - Values to order for stable reporting.
 * @returns A sorted copy of the supplied strings.
 */
function sortStrings(values: Iterable<string>): readonly string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

/**
 * Prints a padded heading for one verification section.
 * @param title - Human-readable section title.
 */
function section(title: string): void {
  console.log(`\n══ ${title} ${"═".repeat(Math.max(0, 60 - title.length))}`);
}

section("Row counts per table");
const described = await op<DescribeAllResult>({
  operation: "describe_all",
});
const counts = await Promise.all(
  sortStrings(Object.keys(described.data)).map(async table => {
    const rows = await sql<CountRow>(`SELECT COUNT(*) AS n FROM data.${table}`);
    const n = rows[0]?.n ?? 0;
    if (n) console.log(`  ${table.padEnd(35)} ${String(n).padStart(4)}`);
    return n;
  })
);
const total = counts.reduce((sum, count) => sum + count, 0);
console.log(`  ${"TOTAL".padEnd(35)} ${String(total).padStart(4)}`);

section("C. James Taylor — career walk");
const taylor = await sql<IdRow>(
  "SELECT id FROM data.Advisor WHERE legalName = 'C. James Taylor'"
);
if (taylor[0]) {
  const rows = await sql<Readonly<Record<string, string>>>(`
    SELECT eh.startDate, eh.endDate, f.name AS firm, eh.roleTitle, eh.reasonForLeaving
    FROM data.EmploymentHistory eh
    JOIN data.Firm f ON f.id = eh.firmId
    WHERE eh.advisorId = '${taylor[0].id}'
    ORDER BY eh.startDate
  `);
  for (const r of rows) {
    const end = r.endDate || "present";
    console.log(
      `  ${r.startDate} → ${end.padEnd(10)}  ${(r.firm ?? "").padEnd(30)}  ${r.roleTitle ?? ""}`
    );
  }
}

section("Taylor Group AUM time-series (snapshots-only model)");
const team = await sql<IdRow>(
  "SELECT id FROM data.Team WHERE name = 'The Taylor Group'"
);
if (team[0]) {
  const rows = await sql<Readonly<Record<string, number | string>>>(`
    SELECT asOf, aum, annualRevenue, sourceType
    FROM data.TeamMetricSnapshot
    WHERE teamId = '${team[0].id}'
    ORDER BY asOf
  `);
  for (const r of rows) {
    const aum = Number(r.aum ?? 0).toLocaleString();
    const rev = Number(r.annualRevenue ?? 0).toLocaleString();
    console.log(
      `  ${r.asOf}  AUM $${aum.padStart(15)}  Rev $${rev.padStart(14)}  src=${r.sourceType}`
    );
  }
}

section("Seed verification complete");
