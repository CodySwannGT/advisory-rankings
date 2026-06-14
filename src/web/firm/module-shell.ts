// Shared shell + metadata + supporting helpers for due-diligence module cards.

import type {
  DataConfidenceModule,
  RecentTransitionMove,
} from "../../harper/resource-firm-due-diligence-types.js";
import { entityPath, fmtDate, humanize } from "../app.js";
import { el } from "../design-system/index.js";
import {
  CLASS_LIST,
  CLASS_LIST_ROW,
  COPY_SOURCE_BACKED,
  EmptyTextComponent,
  LABEL_DATA_CONFIDENCE,
  ModuleShellPayload,
  MoveSubject,
  TagComponent,
} from "./shared.js";
import {
  fmtNumber,
  helpText,
  moduleStatusGroup,
  statusCopy,
  statusTag,
} from "./helpers.js";

const SOURCE_ADVISORHUB_COVERAGE = "AdvisorHub coverage";
const SOURCE_FIRM_BIOS = "Firm bios";
const SOURCE_BROKERCHECK = "FINRA BrokerCheck";
const SOURCE_RANKINGS = "AdvisorBook rankings";

const PUBLIC_SOURCE_NAMES: Readonly<Record<string, string>> = {
  Article: SOURCE_ADVISORHUB_COVERAGE,
  ArticleFirmMention: SOURCE_ADVISORHUB_COVERAGE,
  Branch: SOURCE_FIRM_BIOS,
  BrokerCheckSnapshot: SOURCE_BROKERCHECK,
  EmploymentHistory: SOURCE_FIRM_BIOS,
  RankingEntry: SOURCE_RANKINGS,
  Team: SOURCE_FIRM_BIOS,
  TransitionEvent: SOURCE_ADVISORHUB_COVERAGE,
};

/**
 * Builds a module card shell with status, provenance, and freshness labels.
 * @param title - Module title.
 * @param module - Module payload.
 * @param children - Module body children.
 * @returns Module card node.
 */
export function moduleCard(
  title: string,
  module: ModuleShellPayload | null | undefined,
  ...children: readonly (HTMLElement | null)[]
): HTMLElement {
  return el(
    "article",
    { class: `firm-dd-module firm-dd-module--${moduleStatusGroup(module)}` },
    el(
      "div",
      { class: "firm-dd-module-head" },
      el("h3", {}, title),
      statusTag(module?.status)
    ),
    el("p", { class: "firm-dd-note" }, publicModuleNote(title, module)),
    ...children,
    moduleMeta(module)
  );
}

/**
 * Builds compact source and freshness metadata for a module.
 * @param module - Due-diligence module payload.
 * @returns Metadata row.
 */
export function moduleMeta(
  module: ModuleShellPayload | null | undefined
): HTMLElement {
  const provenance = module?.provenance || {};
  const sourceTables = [
    provenance.sourceTable,
    ...(provenance.sourceTables || []),
  ].filter((s): s is string => Boolean(s));
  const freshness = module?.freshness;
  const sources = publicSourceNames(sourceTables);
  return el(
    "div",
    { class: "firm-dd-meta" },
    helpText(
      "Source state",
      "Source state names the public sources behind this module and whether the module has a current freshness date."
    ),
    sources.length
      ? TagComponent({
          children: `Sources: ${sources.join(", ")}`,
        })
      : TagComponent({ children: "Sources pending" }),
    freshness?.asOf
      ? TagComponent({
          kind: "ok",
          children: `As of ${fmtDate(freshness.asOf as never, { mode: "short" })}`,
        })
      : TagComponent({ kind: "warn", children: "Freshness unavailable" })
  );
}

/**
 * Builds a short list of supporting move links.
 * @param moves - Recent move payloads.
 * @returns Move list or empty state.
 */
export function recentMovesList(
  moves: readonly RecentTransitionMove[]
): HTMLElement {
  if (!moves.length)
    return EmptyTextComponent({
      children: "No recent moves are loaded for this firm.",
    });
  return el(
    "div",
    { class: CLASS_LIST },
    ...moves.map(move => {
      const subject = move.subject as MoveSubject | null | undefined;
      return el(
        "div",
        { class: CLASS_LIST_ROW },
        el(
          "span",
          {},
          subject?.id && subject.kind
            ? el("a", { href: entityPath(subject.kind, subject) }, subject.name)
            : subject?.name || "Unresolved move subject"
        ),
        el(
          "strong",
          {},
          [
            humanize(move.direction),
            move.moveDate ? fmtDate(move.moveDate, { mode: "short" }) : null,
          ]
            .filter(Boolean)
            .join(" · ")
        )
      );
    })
  );
}

/**
 * Builds the data-confidence notes.
 * @param confidence - Confidence payload.
 * @returns Confidence summary.
 */
export function dataConfidenceBlock(
  confidence: DataConfidenceModule | null | undefined
): HTMLElement | null {
  if (!confidence) return null;
  const modules = confidence.modules || [];
  const loadedCount = modules.filter(
    module => module.status === "loaded"
  ).length;
  const status = loadedCount === modules.length ? "loaded" : "not_found";
  return el(
    "div",
    { class: "firm-dd-confidence" },
    el(
      "div",
      { class: "firm-dd-confidence-head" },
      el("strong", {}, LABEL_DATA_CONFIDENCE),
      helpText(
        LABEL_DATA_CONFIDENCE,
        "Data confidence summarizes whether each due-diligence module is backed by public sources or still needs more data."
      ),
      statusTag(status)
    ),
    el("p", {}, dataConfidenceSummary(modules.length, loadedCount)),
    el(
      "div",
      { class: "firm-dd-confidence-modules" },
      ...(confidence.modules || []).map(module =>
        el(
          "span",
          { class: "firm-dd-confidence-chip" },
          `${humanize(module.name)}: ${statusCopy(module.status)}`
        )
      )
    )
  );
}

/**
 * Converts internal provenance tables into unique public source names.
 * @param sourceTables - Internal provenance table names.
 * @returns Reader-facing source labels.
 */
function publicSourceNames(sourceTables: readonly string[]): readonly string[] {
  return [
    ...new Set(sourceTables.map(source => PUBLIC_SOURCE_NAMES[source])),
  ].filter((source): source is string => Boolean(source));
}

/**
 * Builds public copy for a due-diligence module without table jargon.
 * @param title - Module title.
 * @param module - Module payload.
 * @returns Reader-facing module note.
 */
function publicModuleNote(
  title: string,
  module: ModuleShellPayload | null | undefined
): string {
  if (moduleStatusGroup(module) !== "loaded") {
    return needsDataNote(title);
  }
  switch (title) {
    case "Recruiting momentum":
      return `Recent advisor and team moves are backed by ${SOURCE_ADVISORHUB_COVERAGE}.`;
    case "Roster footprint":
      return `Advisor, team, and branch counts are backed by ${SOURCE_FIRM_BIOS.toLowerCase()}.`;
    case "Ranking presence":
      return `Ranking appearances are backed by ${SOURCE_RANKINGS}.`;
    case "Regulatory snapshot":
      return `Regulatory values are backed by ${SOURCE_BROKERCHECK}.`;
    case "Coverage timeline":
      return `Article coverage is backed by ${SOURCE_ADVISORHUB_COVERAGE}.`;
    default:
      return "This module is backed by public source data.";
  }
}

/**
 * Builds a module-specific needs-data note.
 * @param title - Module title.
 * @returns Reader-facing missing-data note.
 */
function needsDataNote(title: string): string {
  switch (title) {
    case "Recruiting momentum":
      return "No recent advisor or team move coverage is loaded for this firm yet.";
    case "Roster footprint":
      return "No firm roster coverage is loaded for this firm yet.";
    case "Ranking presence":
      return "No ranking appearances are loaded for this firm yet.";
    case "Regulatory snapshot":
      return "No FINRA BrokerCheck snapshot is loaded for this firm yet.";
    case "Coverage timeline":
      return "No article coverage is loaded for this firm yet.";
    default:
      return "This module needs more public data.";
  }
}

/**
 * Builds a confidence summary from module statuses.
 * @param total - Total module count.
 * @param loadedCount - Count of modules backed by public sources.
 * @returns Reader-facing confidence summary.
 */
function dataConfidenceSummary(total: number, loadedCount: number): string {
  if (total > 0 && total === loadedCount) {
    return `All ${fmtNumber(total)} due-diligence modules are ${COPY_SOURCE_BACKED.toLowerCase()}.`;
  }
  const needsDataCount = Math.max(total - loadedCount, 0);
  const noun = needsDataCount === 1 ? "module needs" : "modules need";
  return `${fmtNumber(loadedCount)} of ${fmtNumber(total)} due-diligence modules are ${COPY_SOURCE_BACKED.toLowerCase()}; ${fmtNumber(needsDataCount)} ${noun} more public data.`;
}
