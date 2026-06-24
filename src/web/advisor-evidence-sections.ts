// Advisor profile evidence sections.

import type {
  AdvisorProfilePayload,
  ConfidenceSummary,
  EvidenceFreshness,
  ResearchSourceTypeKey,
} from "../types/advisor-profile.js";
import { fmtDate, humanize } from "./app.js";
import { analystEvidenceProfileSections } from "./advisor-evidence-analyst-sections.js";
import { el, SectionCard, Tag } from "./design-system/index.js";

/**
 * Narrow callable type for design-system helpers whose source files still opt
 * out of TS. Mirrors the adapter convention used in `detail-state.ts` so
 * call sites can pass typed option bags without `any` leakage.
 */
type DesignSystemComponent = (
  options: Readonly<Record<string, unknown>>
) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;

/** Evidence card tone — drives the surface variant and tag color. */
type EvidenceTone = "ok" | "warn" | "neutral";

/** Compact state copy rendered in the header of an evidence card. */
interface EvidenceState {
  readonly label: string;
  readonly tone: EvidenceTone;
  readonly body: string;
}

/** Mount targets for responsive evidence card placement. */
interface ResponsiveEvidenceSections {
  readonly desktopRoot: HTMLElement;
  readonly mobileRoot: HTMLElement;
  readonly sections: readonly HTMLElement[];
}

/** Rendering options for public vs. analyst profile evidence. */
interface AdvisorEvidenceProfileSectionOptions {
  readonly showAnalystDetails?: boolean;
}

const RESEARCH_SOURCE_TYPES: readonly ResearchSourceTypeKey[] = [
  "web_research",
  "firm_bio",
  "rankings",
  "press",
];
const PUBLIC_SOURCE_LABEL = "public sources";
const responsiveEvidenceCleanup = new WeakMap<Document, () => void>();

/**
 * Builds advisor evidence cards shared by desktop rail and mobile center flow.
 * @param profile - AdvisorProfile payload.
 * @param options - Evidence rendering options.
 * @returns Public provenance plus analyst detail sections when enabled.
 */
export function advisorEvidenceProfileSections(
  profile: AdvisorProfilePayload,
  options: AdvisorEvidenceProfileSectionOptions = {}
): readonly HTMLElement[] {
  const publicSections = [publicEvidenceSummarySection(profile)];
  if (!options.showAnalystDetails) return publicSections;
  return [
    ...publicSections,
    ...analystEvidenceProfileSections(
      profile.evidenceFreshness,
      profile.confidenceSummary
    ),
  ];
}

/**
 * Moves one advisor evidence DOM set between desktop and mobile slots.
 * @param options - Responsive evidence mount targets.
 * @param options.desktopRoot - Desktop right-rail evidence slot.
 * @param options.mobileRoot - Mobile center-column evidence slot.
 * @param options.sections - Evidence cards to move between slots.
 * @returns Cleanup callback that removes the responsive placement listener.
 */
export function mountResponsiveEvidenceSections({
  desktopRoot,
  mobileRoot,
  sections,
}: ResponsiveEvidenceSections): () => void {
  const mobileQuery = window.matchMedia("(max-width: 800px)");
  const syncEvidencePlacement = (): void => {
    const target = mobileQuery.matches ? mobileRoot : desktopRoot;
    sections.forEach(section => target.appendChild(section));
  };
  const cleanup = (): void =>
    mobileQuery.removeEventListener("change", syncEvidencePlacement);

  responsiveEvidenceCleanup.get(desktopRoot.ownerDocument)?.();
  syncEvidencePlacement();
  mobileQuery.addEventListener("change", syncEvidencePlacement);
  responsiveEvidenceCleanup.set(desktopRoot.ownerDocument, cleanup);
  return cleanup;
}

/**
 * Builds the public profile provenance card.
 * @param profile - AdvisorProfile payload.
 * @returns Human-readable provenance section.
 */
function publicEvidenceSummarySection(
  profile: AdvisorProfilePayload
): HTMLElement {
  const confidence = profile.confidenceSummary;
  const freshness = profile.evidenceFreshness;
  return SectionCardComponent({
    title: sectionTitleWithHelp(
      "Profile provenance",
      "Profile provenance summarizes when AdvisorBook last verified this profile and the public source types behind its facts."
    ),
    attrs: {
      class: "advisor-evidence-card advisor-evidence-card--neutral",
      id: "profile-provenance",
    },
    body: el(
      "div",
      { class: "advisor-evidence" },
      evidenceStateHeader({
        label: freshness.hasData ? "Source-backed" : "Needs review",
        tone: freshness.hasData ? "ok" : "warn",
        body: profileProvenanceLine(freshness),
      }),
      el(
        "p",
        { class: "advisor-evidence-reader-summary" },
        confidenceSummaryLine(confidence)
      )
    ),
  });
}

/**
 * Builds reader-facing provenance copy.
 * @param freshness - Evidence freshness summary.
 * @returns Plain-language source provenance.
 */
function profileProvenanceLine(freshness: EvidenceFreshness): string {
  if (!freshness.hasData) {
    return `Profile data has not yet been verified from ${PUBLIC_SOURCE_LABEL}.`;
  }

  return `Profile data last verified ${fmtDate(freshness.lastCheckedAt, { mode: "short" })} from ${sourceCoverageLabel(freshness.sourceTypeCoverage)}.`;
}

/**
 * Builds reader-facing confidence copy without exposing distribution buckets.
 * @param confidence - Confidence summary payload.
 * @returns Plain-language fact support summary.
 */
function confidenceSummaryLine(confidence: ConfidenceSummary): string {
  const total = numericCount(confidence.total);
  if (!confidence.hasData || !total) {
    return "Cited-source support will appear after source-backed facts are loaded.";
  }
  return `All ${formatNumber(total)} profile fact${total === 1 ? "" : "s"} are backed by cited sources.`;
}

/**
 * Converts non-zero source coverage into a sentence fragment.
 * @param coverage - Source coverage counts by type.
 * @returns Human-readable source type list.
 */
function sourceCoverageLabel(
  coverage: EvidenceFreshness["sourceTypeCoverage"]
): string {
  const labels = RESEARCH_SOURCE_TYPES.filter(
    sourceType => numericCount(coverage[sourceType]) > 0
  ).map(readableLabel);
  if (!labels.length) return PUBLIC_SOURCE_LABEL;
  return `${joinReadableList(labels)} source${labels.length === 1 ? "" : "s"}`;
}

/**
 * Joins labels using natural-language punctuation.
 * @param values - Non-empty display labels.
 * @returns Readable comma/and separated label.
 */
function joinReadableList(values: readonly string[]): string {
  if (values.length <= 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

/**
 * Builds a heading label with a keyboard-focusable explanation affordance.
 * @param label - Term being explained.
 * @param explanation - Public explanation copy.
 * @returns Heading content.
 */
function sectionTitleWithHelp(label: string, explanation: string): HTMLElement {
  return el(
    "span",
    { class: "advisor-evidence-title" },
    el("span", {}, label),
    helpText(label, explanation)
  );
}

/**
 * Builds a keyboard-focusable explanation affordance for evidence terms.
 * @param label - Term being explained.
 * @param explanation - Public explanation copy.
 * @returns Help text disclosure.
 */
function helpText(label: string, explanation: string): HTMLElement {
  return el(
    "details",
    { class: "advisor-evidence-help" },
    el("summary", { "aria-label": `${label} explanation` }, "i"),
    el("p", {}, explanation)
  );
}

/**
 * Builds a compact state header for evidence cards.
 * @param state - State copy and tone.
 * @returns Header node.
 */
function evidenceStateHeader(state: EvidenceState): HTMLElement {
  return el(
    "div",
    { class: "advisor-evidence-state" },
    el("p", {}, state.body),
    Tag({ kind: tagTone(state.tone), children: state.label })
  );
}

/**
 * Maps evidence tone to the shared tag tone.
 * @param tone - Evidence tone.
 * @returns Tag kind.
 */
function tagTone(tone: EvidenceTone): "ok" | "warn" | "default" {
  return tone === "ok" ? "ok" : tone === "warn" ? "warn" : "default";
}

/**
 * Converts a value to a safe non-negative count.
 * @param value - Count-like value.
 * @returns Numeric count.
 */
function numericCount(value: unknown): number {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/**
 * Formats a compact count.
 * @param value - Count-like value.
 * @returns Localized count.
 */
function formatNumber(value: unknown): string {
  return numericCount(value).toLocaleString();
}

/**
 * Converts machine keys into a non-empty display label.
 * @param value - Raw key.
 * @returns Human-readable label.
 */
function readableLabel(value: string): string {
  return humanize(value) || value;
}
