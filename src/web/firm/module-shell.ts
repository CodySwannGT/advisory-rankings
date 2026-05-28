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
    module?.note ? el("p", { class: "firm-dd-note" }, module.note) : null,
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
  const sourceIds = provenance.sourceIds || [];
  const freshness = module?.freshness;
  return el(
    "div",
    { class: "firm-dd-meta" },
    helpText(
      "Source state",
      "Source state explains which loaded rows support this module and whether the module has a current freshness date."
    ),
    sourceTables.length
      ? TagComponent({
          children: `Source: ${sourceTables.join(", ")}`,
        })
      : null,
    sourceIds.length
      ? TagComponent({
          children: `${fmtNumber(sourceIds.length)} source row(s)`,
        })
      : TagComponent({ children: "No source rows yet" }),
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
      children: "No recent move rows are loaded for this firm.",
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
  return el(
    "div",
    { class: "firm-dd-confidence" },
    el(
      "div",
      { class: "firm-dd-confidence-head" },
      el("strong", {}, LABEL_DATA_CONFIDENCE),
      helpText(
        LABEL_DATA_CONFIDENCE,
        "Data confidence summarizes whether each due-diligence module is supported by public source rows, needs more data, or needs review."
      ),
      statusTag(confidence.status)
    ),
    el("p", {}, confidence.note || ""),
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
