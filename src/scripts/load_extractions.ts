#!/usr/bin/env node
// @ts-nocheck
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  advisorId,
  articleId,
  disclosureId,
  employmentHistoryId,
  firmId,
  sanctionId,
  uid,
} from "../lib/ids.js";
import { describeTarget, upsert } from "../lib/harper.js";

const EXTRACT_DIR = "research/extractions";
const LOADED_DIR = join(EXTRACT_DIR, ".loaded");

function opt(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function arr<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

async function files(): Promise<string[]> {
  if (opt("--wpid")) return [join(EXTRACT_DIR, `${opt("--wpid")}.json`)];
  if (!existsSync(EXTRACT_DIR)) return [];
  return (await readdir(EXTRACT_DIR)).filter(f => f.endsWith(".json")).map(f => join(EXTRACT_DIR, f));
}

export function buildRows(ex: any): Record<string, any[]> {
  const rows: Record<string, any[]> = {};
  const push = (table: string, row: any) => {
    rows[table] ??= [];
    rows[table].push(row);
  };
  const article = ex.article ?? {};
  const aid = articleId(article.url ?? String(article.wpId ?? ""));
  push("Article", {
    id: aid,
    wpId: article.wpId,
    wpPostType: article.wpPostType ?? "post",
    url: article.url,
    slug: article.slug,
    headline: article.headline,
    publishedDate: article.publishedDate,
    modifiedDate: article.modifiedDate,
    authors: article.authors ?? [],
    category: article.category ?? "unknown",
    wpCategories: article.wpCategories ?? [],
    wpTags: article.wpTags ?? [],
  });
  const advisorByName = new Map<string, string>();
  const firmByName = new Map<string, string>();
  for (const f of arr(ex.firms)) {
    const name = f.natural_key?.canonical_name ?? f.fields?.name;
    const id = firmId(name);
    firmByName.set(name, id);
    push("Firm", { id, name, ...f.fields });
  }
  for (const a of arr(ex.advisors)) {
    const name = a.natural_key?.legal_name ?? a.fields?.legalName;
    const id = advisorId(name, a.natural_key?.first_employer ?? String(a.natural_key?.career_start_year ?? ""));
    advisorByName.set(name, id);
    push("Advisor", { id, legalName: name, ...a.fields });
    push("ArticleAdvisorMention", { id: uid(`aam:${aid}:${id}`), articleId: aid, advisorId: id });
  }
  for (const [name, id] of firmByName) {
    push("ArticleFirmMention", { id: uid(`afm:${aid}:${id}`), articleId: aid, firmId: id });
  }
  const disclosureByLocal = new Map<string, string>();
  for (const d of arr(ex.disclosures)) {
    const advId = advisorByName.get(d.advisor_legal_name) ?? advisorId(d.advisor_legal_name ?? "", "");
    const fields = d.fields ?? {};
    const id = disclosureId(advId, fields.disclosureType ?? d.natural_key?.disclosure_type ?? "", fields.dateInitiated ?? fields.dateResolved ?? "", fields.regulator ?? d.natural_key?.regulator ?? "");
    disclosureByLocal.set(d.local_key, id);
    push("Disclosure", { id, advisorId: advId, ...fields });
    push("ArticleDisclosureMention", { id: uid(`adm:${aid}:${id}`), articleId: aid, disclosureId: id });
  }
  for (const eh of arr(ex.employment_histories)) {
    const advId = advisorByName.get(eh.advisor_legal_name) ?? advisorId(eh.advisor_legal_name ?? "", "");
    const fid = firmByName.get(eh.firm_canonical_name) ?? firmId(eh.firm_canonical_name ?? "");
    push("EmploymentHistory", {
      id: employmentHistoryId(advId, fid, eh.fields?.startDate ?? ""),
      advisorId: advId,
      firmId: fid,
      ...eh.fields,
    });
  }
  for (const s of arr(ex.sanctions)) {
    const did = disclosureByLocal.get(s.disclosure_local_key);
    if (!did) continue;
    const fields = s.fields ?? {};
    push("Sanction", {
      id: sanctionId(did, fields.sanctionType ?? "", String(fields.amount ?? ""), String(fields.durationMonths ?? "")),
      disclosureId: did,
      ...fields,
    });
  }
  for (const oba of arr(ex.outside_business_activities)) {
    const advId = advisorByName.get(oba.advisor_legal_name) ?? advisorId(oba.advisor_legal_name ?? "", "");
    push("OutsideBusinessActivity", {
      id: uid(`oba:${advId}:${oba.fields?.name ?? ""}`),
      advisorId: advId,
      ...oba.fields,
    });
  }
  for (const fa of arr(ex.field_assertions)) {
    push("FieldAssertion", {
      id: uid(`fa:${aid}:${fa.target_table}:${fa.field}:${JSON.stringify(fa.value)}`),
      articleId: aid,
      targetTable: fa.target_table,
      fieldName: fa.field,
      assertedValue: JSON.stringify(fa.value),
      quotePhrase: fa.quote,
      confidence: fa.confidence ?? "asserted",
    });
  }
  return rows;
}

async function main(): Promise<void> {
  console.error(`[load_extractions] target: ${describeTarget()}`);
  const dryRun = process.argv.includes("--dry-run");
  await mkdir(LOADED_DIR, { recursive: true });

  for (const file of await files()) {
    const ex = JSON.parse(await readFile(file, "utf8"));
    const rows = buildRows(ex);
    const summary: Record<string, number> = {};
    for (const [table, tableRows] of Object.entries(rows)) {
      summary[table] = dryRun
        ? tableRows.length
        : await upsert(table, tableRows);
    }
    console.log(`${file}: ${JSON.stringify(summary)}`);
    if (!dryRun) await rename(file, join(LOADED_DIR, file.split("/").pop()!));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
