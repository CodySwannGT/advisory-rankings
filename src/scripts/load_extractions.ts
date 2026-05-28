#!/usr/bin/env node
import { mkdir, readdir, readFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  articleId,
  disclosureId,
  employmentHistoryId,
  sanctionId,
  uid,
} from "../lib/ids.js";
import {
  canonicalFirmId,
  canonicalFirmName,
  curatedFirmAliasRows,
} from "../lib/firm-identity.js";
import { describeTarget } from "../lib/harper.js";
import {
  advisorKey,
  advisorLookup,
  advisorName,
  asRecord,
  extractionRows,
  firmLookup,
  firmPairsFor,
  firmSourceName,
  firmSourceRows,
  mergeGroups,
  stringValue,
  summarizeUpserts,
  uniqueById,
  type Row,
} from "./load_extractions_helpers.js";

const EXTRACT_DIR = "research/extractions";
const LOADED_DIR = join(EXTRACT_DIR, ".loaded");

const opt = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const extractionFiles = async (): Promise<ReadonlyArray<string>> => {
  const wpId = opt("--wpid");
  if (wpId) return [join(EXTRACT_DIR, `${wpId}.json`)];
  if (!existsSync(EXTRACT_DIR)) return [];
  return (await readdir(EXTRACT_DIR))
    .filter(file => file.endsWith(".json"))
    .map(file => join(EXTRACT_DIR, file));
};

/**
 * Builds Harper rows from one extracted AdvisorHub article payload.
 * @param extraction - Parsed extraction JSON from research/extractions.
 * @returns Rows grouped by Harper table name for idempotent upserts.
 */
export const buildRows = (extraction: unknown) => {
  const ex = asRecord(extraction);
  const article = asRecord(ex.article);
  const aid = articleId(stringValue(article.url) || String(article.wpId ?? ""));
  const context = buildContext(aid, ex);
  return mergeGroups(
    { Article: [articleRow(aid, article)] },
    { FirmAlias: curatedFirmAliasRows().map(row => ({ ...row })) },
    firmRows(ex, context),
    advisorRows(ex, context),
    disclosureRows(ex, context),
    employmentRows(ex, context),
    sanctionRows(ex, context),
    outsideBusinessRows(ex, context),
    fieldAssertionRows(ex, context)
  );
};

const buildContext = (aid: string, ex: Row) => {
  const firmPairs = firmSourceRows(ex).flatMap(firmPairsFor);
  const advisorPairs = extractionRows(ex.advisors).map(advisor => ({
    name: advisorName(advisor),
    id: advisorKey(advisor),
  }));
  return { aid, firmPairs, advisorPairs };
};

const articleRow = (aid: string, article: Row): Row => ({
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

const firmRows = (ex: Row, context: ReturnType<typeof buildContext>) => {
  const firms = firmSourceRows(ex).map(firm => {
    const sourceName = firmSourceName(firm);
    return {
      id: canonicalFirmId(sourceName),
      ...asRecord(firm.fields),
      name: canonicalFirmName(sourceName),
    };
  });
  const mentions = uniqueById(
    context.firmPairs.map(({ id }) => ({
      id: uid(`afm:${context.aid}:${id}`),
      articleId: context.aid,
      firmId: id,
    }))
  );
  return { Firm: uniqueById(firms), ArticleFirmMention: mentions };
};

const advisorRows = (ex: Row, context: ReturnType<typeof buildContext>) => {
  const advisors = extractionRows(ex.advisors).map(advisor => ({
    id: advisorKey(advisor),
    legalName: advisorName(advisor),
    ...asRecord(advisor.fields),
  }));
  const mentions = context.advisorPairs.map(({ id }) => ({
    id: uid(`aam:${context.aid}:${id}`),
    articleId: context.aid,
    advisorId: id,
  }));
  return { Advisor: advisors, ArticleAdvisorMention: mentions };
};

const disclosureRows = (ex: Row, context: ReturnType<typeof buildContext>) => {
  const disclosures = extractionRows(ex.disclosures).map(disclosure =>
    disclosureRow(disclosure, context)
  );
  return {
    Disclosure: disclosures,
    ArticleDisclosureMention: disclosures.map(row => ({
      id: uid(`adm:${context.aid}:${row.id}`),
      articleId: context.aid,
      disclosureId: row.id,
    })),
  };
};

const employmentRows = (ex: Row, context: ReturnType<typeof buildContext>) => ({
  EmploymentHistory: extractionRows(ex.employment_histories).map(employment => {
    const advisor = advisorLookup(
      context.advisorPairs,
      stringValue(employment.advisor_legal_name)
    );
    const firm = firmLookup(
      context.firmPairs,
      stringValue(employment.firm_canonical_name)
    );
    const fields = asRecord(employment.fields);
    return {
      id: employmentHistoryId(advisor, firm, stringValue(fields.startDate)),
      advisorId: advisor,
      firmId: firm,
      ...fields,
    };
  }),
});

const sanctionRows = (ex: Row, context: ReturnType<typeof buildContext>) => ({
  Sanction: extractionRows(ex.sanctions).flatMap(sanction => {
    const disclosure = disclosureIdForLocal(
      ex,
      context,
      stringValue(sanction.disclosure_local_key)
    );
    if (!disclosure) return [];
    const fields = asRecord(sanction.fields);
    return [
      {
        id: sanctionId(
          disclosure,
          stringValue(fields.sanctionType),
          String(fields.amount ?? ""),
          String(fields.durationMonths ?? "")
        ),
        disclosureId: disclosure,
        ...fields,
      },
    ];
  }),
});

const outsideBusinessRows = (
  ex: Row,
  context: ReturnType<typeof buildContext>
) => ({
  OutsideBusinessActivity: extractionRows(ex.outside_business_activities).map(
    activity => {
      const advisor = advisorLookup(
        context.advisorPairs,
        stringValue(activity.advisor_legal_name)
      );
      const fields = asRecord(activity.fields);
      return {
        id: uid(`oba:${advisor}:${fields.name ?? ""}`),
        advisorId: advisor,
        ...fields,
      };
    }
  ),
});

const fieldAssertionRows = (
  ex: Row,
  context: ReturnType<typeof buildContext>
) => ({
  FieldAssertion: extractionRows(ex.field_assertions).flatMap(assertion => {
    const targetId = fieldAssertionTargetId(ex, context, assertion);
    const field = stringValue(assertion.field);
    if (!targetId || !field) return [];
    return [
      {
        id: uid(
          `fa:${context.aid}:${assertion.target_table}:${field}:${JSON.stringify(assertion.value)}`
        ),
        articleId: context.aid,
        targetTable: assertion.target_table,
        targetId,
        fieldName: field,
        assertedValue: JSON.stringify(assertion.value),
        quotePhrase: assertion.quote,
        confidence: assertion.confidence ?? "asserted",
      },
    ];
  }),
});

const fieldAssertionTargetId = (
  ex: Row,
  context: ReturnType<typeof buildContext>,
  assertion: Row
): string | null => {
  const targetRef = stringValue(assertion.target_ref);
  if (!targetRef) return null;
  const targetTable = stringValue(assertion.target_table);
  if (targetTable === "Advisor")
    return advisorLookup(context.advisorPairs, targetRef);
  if (targetTable === "Firm") return firmLookup(context.firmPairs, targetRef);
  if (targetTable === "Disclosure")
    return disclosureIdForLocal(ex, context, targetRef);
  if (targetTable === "Article") return context.aid;
  return uid(`fa-target:${targetTable || "unknown"}:${targetRef}`);
};

const disclosureRow = (
  disclosure: Row,
  context: ReturnType<typeof buildContext>
): Row => {
  const advisor = advisorLookup(
    context.advisorPairs,
    stringValue(disclosure.advisor_legal_name)
  );
  const fields = asRecord(disclosure.fields);
  const naturalKey = asRecord(disclosure.natural_key);
  return {
    id: disclosureId(
      advisor,
      stringValue(fields.disclosureType ?? naturalKey.disclosure_type),
      stringValue(fields.dateInitiated ?? fields.dateResolved),
      stringValue(fields.regulator ?? naturalKey.regulator)
    ),
    advisorId: advisor,
    localKey: disclosure.local_key,
    ...fields,
  };
};

const disclosureIdForLocal = (
  ex: Row,
  context: ReturnType<typeof buildContext>,
  localKey: string
): string | null => {
  const disclosure = extractionRows(ex.disclosures).find(
    row => row.local_key === localKey
  );
  return disclosure ? stringValue(disclosureRow(disclosure, context).id) : null;
};

const loadFile = async (file: string, dryRun: boolean): Promise<void> => {
  const rows = buildRows(JSON.parse(await readFile(file, "utf8")) as unknown);
  const summary = await summarizeUpserts(rows, dryRun);
  console.log(`${file}: ${JSON.stringify(summary)}`);
  if (!dryRun)
    await rename(
      file,
      join(LOADED_DIR, file.split("/").at(-1) ?? "loaded.json")
    );
};

const main = async (): Promise<void> => {
  const dryRun = process.argv.includes("--dry-run");
  console.error(`[load_extractions] target: ${describeTarget()}`);
  await mkdir(LOADED_DIR, { recursive: true });
  await Promise.all(
    (await extractionFiles()).map(file => loadFile(file, dryRun))
  );
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
