import type { HarperDate } from "../types/harper-schema.js";
import type { TeamMemberRow } from "../harper/resource-team.js";
import type { TransitionRow } from "../harper/resource-feed-types.js";
import { articlePath, type ArticleLike } from "./urls.js";
import { fmtDate, fmtMoney, humanize } from "./app-formatters.js";
import { el, SectionCard } from "./design-system/index.js";
import type { MetricSnapshotView } from "./team-sections.js";

/** Uniform adapter for opaque design-system DOM factories. */
type DesignSystemComponent = (...args: readonly unknown[]) => HTMLElement;

const SectionCardComponent = SectionCard as unknown as DesignSystemComponent;

/** Public TeamProfile slices used to derive timeline rows. */
interface TeamContinuityInputs {
  readonly currentMembers: readonly TeamMemberRow[];
  readonly pastMembers: readonly TeamMemberRow[];
  readonly metricSnapshots: readonly MetricSnapshotView[];
  readonly transitions: readonly unknown[];
  readonly articles: readonly unknown[];
}

/** Compact article row shape exposed in team profile coverage. */
interface ContinuityArticle extends ArticleLike {
  readonly headline?: string;
  readonly publishedDate?: HarperDate;
  readonly category?: string;
}

/** Render-ready continuity event derived from one public profile slice. */
interface ContinuityItem {
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly date?: HarperDate;
  readonly dateLimit: string;
  readonly confidence: string;
  readonly href?: string;
  readonly order: number;
}

/**
 * Builds the unified public continuity timeline card.
 * @param inputs - Public team profile slices returned by TeamProfile.
 * @returns Timeline card or null when the profile has no timeline inputs.
 */
export function teamContinuityCard(
  inputs: TeamContinuityInputs
): HTMLElement | null {
  const items = continuityItems(inputs);
  if (!items.length) return null;
  return SectionCardComponent({
    title: `Continuity timeline (${items.length.toLocaleString()} item${items.length === 1 ? "" : "s"})`,
    body: el(
      "div",
      { class: "timeline team-continuity-timeline" },
      ...items.map(item => continuityStep(item))
    ),
  });
}

/**
 * Derives and chronologically orders timeline items from profile slices.
 * @param inputs - Public team profile slices returned by TeamProfile.
 * @returns Ordered continuity timeline items.
 */
function continuityItems(
  inputs: TeamContinuityInputs
): readonly ContinuityItem[] {
  return [
    ...memberItems(inputs.currentMembers, inputs.pastMembers),
    ...inputs.metricSnapshots.map(metricItem),
    ...inputs.transitions.flatMap(transitionItem),
    ...inputs.articles.flatMap(articleItem),
  ].sort(compareContinuityItems);
}

/**
 * Converts current and past membership rows into roster timeline items.
 * @param currentMembers - Public current team membership rows.
 * @param pastMembers - Public past team membership rows.
 * @returns Roster continuity items.
 */
function memberItems(
  currentMembers: readonly TeamMemberRow[],
  pastMembers: readonly TeamMemberRow[]
): readonly ContinuityItem[] {
  const currentRosterItems: readonly ContinuityItem[] = currentMembers.length
    ? [
        {
          kind: "Roster",
          title: `Current roster: ${summarizeMembers(currentMembers)}`,
          body: `${currentMembers.length.toLocaleString()} public current member row${currentMembers.length === 1 ? "" : "s"} support this team roster.`,
          date: earliestMemberStart(currentMembers),
          dateLimit:
            "Earliest available member start date; roster may predate loaded records.",
          confidence:
            "Source confidence: public TeamProfile current member rows.",
          href: memberHref(currentMembers[0]),
          order: 10,
        },
      ]
    : [];
  return [
    ...currentRosterItems,
    ...pastMembers.map(member => ({
      kind: "Roster change",
      title: `${member.advisor.name} listed as a past member`,
      body: [
        humanize(member.role ?? undefined) || "Past team member",
        member.endDate
          ? "departure date is loaded"
          : "departure date is not loaded",
      ].join("; "),
      date: member.endDate ?? member.startDate,
      dateLimit: member.endDate
        ? "Past-member end date."
        : "Past-member date unavailable; using start date when present.",
      confidence: "Source confidence: public TeamProfile past member row.",
      href: memberHref(member),
      order: 20,
    })),
  ];
}

/**
 * Converts one team metric snapshot into a continuity item.
 * @param snapshot - Metric snapshot row from TeamProfile.
 * @returns Metric snapshot continuity item.
 */
function metricItem(snapshot: MetricSnapshotView): ContinuityItem {
  const metrics = [
    snapshot.aum != null ? `${fmtMoney(snapshot.aum)} AUM` : null,
    snapshot.teamSize != null ? `${snapshot.teamSize} members` : null,
    snapshot.householdCount != null
      ? `${snapshot.householdCount} households`
      : null,
    snapshot.annualRevenue != null
      ? `${fmtMoney(snapshot.annualRevenue)} revenue`
      : null,
  ].filter((part): part is string => part != null);
  return {
    kind: "Metric snapshot",
    title: metrics.length ? metrics.join(" · ") : "Team metric snapshot",
    body: snapshot.sourceType
      ? `Snapshot source type: ${humanize(snapshot.sourceType) || snapshot.sourceType}.`
      : "Snapshot source type is not loaded.",
    date: snapshot.asOf,
    dateLimit: snapshot.asOf
      ? "Snapshot as-of date."
      : "Snapshot date unavailable; position is approximate.",
    confidence: "Source confidence: public TeamProfile metric snapshot.",
    order: 30,
  };
}

/**
 * Converts an unknown transition payload into zero or one continuity item.
 * @param value - Candidate transition row from TeamProfile.
 * @returns Transition continuity item when the row shape is supported.
 */
function transitionItem(value: unknown): readonly ContinuityItem[] {
  if (!isTransitionRow(value)) return [];
  const fromFirm =
    value.fromFirm?.short || value.fromFirm?.name || "prior firm";
  const toFirm = value.toFirm?.short || value.toFirm?.name || "new firm";
  return [
    {
      kind: "Transition",
      title: `Moved from ${fromFirm} to ${toFirm}`,
      body: transitionBody(value),
      date: value.moveDate,
      dateLimit: value.moveDate
        ? "Recruiting transition move date."
        : "Move date unavailable; transition order is approximate.",
      confidence: "Source confidence: public TransitionEvent row.",
      href: value.toFirm
        ? `/firm.html?id=${encodeURIComponent(value.toFirm.id)}`
        : undefined,
      order: 40,
    },
  ];
}

/**
 * Converts an unknown article payload into zero or one evidence item.
 * @param value - Candidate article row from TeamProfile coverage.
 * @returns Article evidence item when the row shape is supported.
 */
function articleItem(value: unknown): readonly ContinuityItem[] {
  if (!isContinuityArticle(value)) return [];
  return [
    {
      kind: "Article evidence",
      title: value.headline || "Coverage article",
      body: value.category
        ? `Article mention categorized as ${humanize(value.category) || value.category}.`
        : "Article mention backs this team profile.",
      date: value.publishedDate,
      dateLimit: value.publishedDate
        ? "Article published date."
        : "Article date unavailable; evidence order is approximate.",
      confidence: "Source confidence: public article mention.",
      href: articlePath(value),
      order: 50,
    },
  ];
}

/**
 * Renders one continuity item using the existing timeline markup.
 * @param item - Continuity item to render.
 * @returns Timeline step element.
 */
function continuityStep(item: ContinuityItem): HTMLElement {
  const title = item.href
    ? el("a", { href: item.href }, item.title)
    : el("span", {}, item.title);
  return el(
    "div",
    { class: "step" },
    el("div", { class: "marker" }),
    el(
      "div",
      { class: "body" },
      el("div", { class: "when" }, formatItemDate(item)),
      el(
        "div",
        { class: "title" },
        el("span", { class: "timeline-kind" }, item.kind),
        title
      ),
      el("div", { class: "role" }, item.body),
      el("div", { class: "role" }, item.confidence)
    )
  );
}

/**
 * Orders continuity items by known date, then deterministic source priority.
 * @param a - Left item.
 * @param b - Right item.
 * @returns Negative, zero, or positive sort comparison.
 */
function compareContinuityItems(a: ContinuityItem, b: ContinuityItem): number {
  const dateDiff = dateRank(a.date) - dateRank(b.date);
  if (dateDiff !== 0) return dateDiff;
  return a.order - b.order;
}

/**
 * Converts a date-like value into a sortable timestamp.
 * @param value - Optional Harper date value.
 * @returns Timestamp rank, or a large value when no date is available.
 */
function dateRank(value: HarperDate | undefined): number {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

/**
 * Formats the date and limitation copy for one timeline row.
 * @param item - Continuity item being rendered.
 * @returns Display date and limitation text.
 */
function formatItemDate(item: ContinuityItem): string {
  const date = item.date ? fmtDate(item.date, { mode: "short" }) : null;
  return date ? `${date} · ${item.dateLimit}` : item.dateLimit;
}

/**
 * Summarizes current roster names for the aggregate roster item.
 * @param members - Current member rows.
 * @returns Compact comma-separated roster summary.
 */
function summarizeMembers(members: readonly TeamMemberRow[]): string {
  const names = members.map(member => member.advisor.name).filter(Boolean);
  if (names.length <= 2) return names.join(", ");
  return `${names[0]}, ${names[1]}, and ${(names.length - 2).toLocaleString()} more`;
}

/**
 * Finds the earliest loaded start date across current members.
 * @param members - Current member rows.
 * @returns Earliest start date, or undefined when none are loaded.
 */
function earliestMemberStart(
  members: readonly TeamMemberRow[]
): HarperDate | undefined {
  return members
    .map(member => member.startDate)
    .filter((date): date is HarperDate => Boolean(date))
    .sort((a, b) => dateRank(a) - dateRank(b))[0];
}

/**
 * Builds an advisor profile URL for a roster item.
 * @param member - Team membership row.
 * @returns Advisor profile URL when a member is available.
 */
function memberHref(member: TeamMemberRow | undefined): string | undefined {
  return member
    ? `/advisor.html?id=${encodeURIComponent(member.advisor.id)}`
    : undefined;
}

/**
 * Formats public transition metrics into compact row copy.
 * @param transition - Transition row from TeamProfile.
 * @returns Human-readable transition metric summary.
 */
function transitionBody(transition: TransitionRow): string {
  const metrics = [
    transition.aumMoved != null
      ? `${fmtMoney(transition.aumMoved)} moved`
      : null,
    transition.headcountMoved != null
      ? `${transition.headcountMoved} advisors moved`
      : null,
    transition.productionT12 != null
      ? `${fmtMoney(transition.productionT12)} T-12 production`
      : null,
  ].filter((part): part is string => part != null);
  return metrics.length
    ? metrics.join("; ")
    : "Transition metrics are limited to loaded public fields.";
}

/**
 * Narrows an unknown TeamProfile transition row.
 * @param value - Candidate transition row.
 * @returns Whether the value has the transition fields this card reads.
 */
function isTransitionRow(value: unknown): value is TransitionRow {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    ("fromFirm" in value || "toFirm" in value || "moveDate" in value)
  );
}

/**
 * Narrows an unknown TeamProfile coverage row.
 * @param value - Candidate article row.
 * @returns Whether the value has article fields this card reads.
 */
function isContinuityArticle(value: unknown): value is ContinuityArticle {
  return typeof value === "object" && value !== null && "id" in value;
}
