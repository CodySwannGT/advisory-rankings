// Firm profile auxiliary sections.

import { api, fmtDate, humanize, initials, entityPath } from "./app.js";
import { firmBranchExplorerHref } from "./branches-url.js";
import { Avatar, Tag } from "./design-system/index.js";
import {
  EntityRowC,
  EntityListC,
  SectionCardC,
  DetailsCardC,
  HeadingC,
  SourceAttributionC,
  PaginatedC,
  elC,
} from "./design-system-adapters.js";
import type { FirmRow, BranchRow } from "../types/harper-schema.js";
import type {
  FirmAdvisorPublicRow,
  FirmAdvisorsResponse,
} from "../harper/resource-profile-endpoints-types.js";

/** BrokerCheck snapshot slice consumed by `regulatoryCard`. */
interface FirmBrokerCheckSnapshot {
  readonly subjectCrd: string;
  readonly bcScope?: string | null;
  readonly iaScope?: string | null;
  readonly disclosureCount?: number | null;
  readonly registeredStateCount?: number | null;
  readonly fetchedAt: string | number | Date;
}

/** Tag descriptor accepted by `ProfileHead.tags`. */
interface ProfileTag {
  readonly kind?: string;
  readonly label: string;
}

/** Options accepted by `advisorRow` and `advisorTail`. */
interface AdvisorRowOptions {
  readonly showStart?: boolean;
  readonly showEnd?: boolean;
}

/**
 * Builds the firm details right-rail card.
 * @param f - Firm profile record.
 * @returns Details card node.
 */
export function firmDetailsCard(f: FirmRow): HTMLElement {
  return DetailsCardC({
    title: "Firm details",
    pairs: [
      ["Channel", humanize(f.channel)],
      ["Sub-channel", humanize(f.subChannel)],
      [
        "Headquarters",
        [f.hqCity, f.hqState, f.hqCountry].filter(Boolean).join(", "),
      ],
      ["Founded", f.foundedYear],
      [
        "Dissolved",
        f.dissolvedYear
          ? [f.dissolvedYear, humanize(f.dissolutionReason)]
              .filter(Boolean)
              .join(" · ")
          : null,
      ],
      ["FINRA CRD", f.finraCrd],
      ["SEC filer ID", f.secFilerId],
      [
        "Website",
        f.website
          ? elC(
              "a",
              { href: f.website, target: "_blank", rel: "noreferrer" },
              f.website
            )
          : null,
      ],
    ],
  });
}

/**
 * Builds the BrokerCheck regulatory-record card.
 * @param snapshot - BrokerCheck snapshot row.
 * @returns Regulatory card or null.
 */
export function regulatoryCard(
  snapshot: FirmBrokerCheckSnapshot | null | undefined
): HTMLElement | null {
  return snapshot
    ? SectionCardC({
        body: [
          HeadingC({
            level: 3,
            attrs: { class: "card-subtitle" },
            children: "Regulatory record",
          }),
          elC(
            "div",
            { class: "kv-list" },
            _kvRow("FINRA scope (BD)", snapshot.bcScope),
            _kvRow("IA scope", snapshot.iaScope),
            _kvRow("Disclosures", snapshot.disclosureCount ?? "—"),
            _kvRow("State registrations", snapshot.registeredStateCount ?? "—")
          ),
          SourceAttributionC({
            source: "FINRA BrokerCheck",
            url: `https://brokercheck.finra.org/firm/summary/${encodeURIComponent(snapshot.subjectCrd)}`,
            termsUrl: "https://brokercheck.finra.org/terms",
            fetchedAt: snapshot.fetchedAt,
          }),
        ],
      })
    : null;
}

/**
 * Builds the branch list card.
 * @param firm - Firm row owning the branch list.
 * @param branches - Branch rows for the firm.
 * @returns Branches card or null.
 */
export function branchesCard(
  firm: FirmRow,
  branches: readonly BranchRow[]
): HTMLElement | null {
  return branches.length
    ? SectionCardC({
        body: [
          HeadingC({
            level: 3,
            attrs: { class: "card-subtitle" },
            children: `Branches (${branches.length.toLocaleString()})`,
          }),
          elC(
            "p",
            { class: "muted" },
            elC(
              "a",
              { href: firmBranchExplorerHref(firm.id) },
              "Open branch explorer"
            ),
            " with this firm selected."
          ),
          EntityListC({
            rows: branches.map(b =>
              EntityRowC({
                avatar: branchAvatar(b),
                name: b.name || b.buildingName || "(unnamed)",
                sub: [b.level, [b.city, b.state].filter(Boolean).join(", ")]
                  .filter(Boolean)
                  .join(" · "),
              })
            ),
          }),
        ],
      })
    : null;
}

/**
 * Chooses a compact branch-level avatar letter.
 * @param branch - Branch row.
 * @returns Avatar text.
 */
function branchAvatar(branch: BranchRow): string {
  if (branch.level === "market") return "M";
  if (branch.level === "complex") return "C";
  return "B";
}

/**
 * Renders a single key/value row, returning an empty span when the value is blank.
 * @param k - Key label shown on the left.
 * @param v - Value displayed on the right; falsy values render an empty span.
 * @returns Key/value row node.
 */
function _kvRow(k: string, v: string | number | null | undefined): HTMLElement {
  if (v === null || v === undefined || v === "") return elC("span");
  return elC(
    "div",
    { class: "kv-row" },
    elC("span", { class: "kv-key" }, k),
    " ",
    elC("span", { class: "kv-val" }, formatKvValue(v))
  );
}

/**
 * Formats key/value rows without collapsing labels into numeric values.
 * @param value - Row value to display.
 * @returns Display value.
 */
function formatKvValue(value: string | number): string {
  return typeof value === "number" ? value.toLocaleString() : value;
}

/**
 * Builds an advisor row for the firm roster.
 * @param r - Firm advisor row.
 * @param options - Date display options.
 * @param options.showStart - Whether to show a since label.
 * @param options.showEnd - Whether to show a start/end range.
 * @returns Entity row node for the advisor.
 */
export function advisorRow(
  r: FirmAdvisorPublicRow,
  { showStart = false, showEnd = false }: AdvisorRowOptions = {}
): HTMLElement {
  const a = r.advisor;
  const sub = [r.roleTitle, humanize(r.roleCategory)]
    .filter(Boolean)
    .join(" · ");
  const tail = advisorTail(r, { showStart, showEnd });
  return EntityRowC({
    avatar: Avatar({
      initials: initials(a.name),
      imageUrl: a.headshotUrl,
      alt: a.name,
    }),
    name: a.name,
    sub,
    tail:
      r.reasonForLeaving === "terminated_for_cause"
        ? [
            tail,
            Tag({
              kind: "danger",
              attrs: { style: "margin-top:2px;display:block;" },
              children: "terminated",
            }),
          ]
        : tail,
    href: entityPath("advisor", a),
  });
}

/**
 * Builds display tags for firm profile status and channels.
 * @param f - Firm profile record.
 * @returns Tags for ProfileHead.
 */
export function firmTags(f: FirmRow): readonly ProfileTag[] {
  const channelLabel = humanize(f.channel);
  const subChannelLabel = humanize(f.subChannel);
  const candidates: readonly (ProfileTag | null)[] = [
    channelLabel ? { label: channelLabel } : null,
    subChannelLabel ? { label: subChannelLabel } : null,
    f.dissolvedYear
      ? { kind: "danger", label: `dissolved ${f.dissolvedYear}` }
      : null,
    f.parentFirmId ? { kind: "warn", label: "subsidiary" } : null,
  ];
  return candidates.filter((tag): tag is ProfileTag => tag !== null);
}

/**
 * Builds location, founding, and CRD subtitle text for a firm.
 * @param f - Firm profile record.
 * @returns Subtitle text for ProfileHead.
 */
export function firmSubtitle(f: FirmRow): string {
  return [
    f.hqCity || f.hqState
      ? [f.hqCity, f.hqState].filter(Boolean).join(", ")
      : null,
    f.foundedYear ? `founded ${f.foundedYear}` : null,
    f.finraCrd ? `FINRA CRD ${f.finraCrd}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Builds the date label for a firm advisor row.
 * @param row - Firm advisor row.
 * @param options - Date display options.
 * @param options.showStart - Whether to show a since label.
 * @param options.showEnd - Whether to show a start/end range.
 * @returns Tail text for the advisor row.
 */
export function advisorTail(
  row: FirmAdvisorPublicRow,
  { showStart = false, showEnd = false }: AdvisorRowOptions = {}
): string {
  if (showStart && row.startDate)
    return `since ${fmtDate(row.startDate, { mode: "short" })}`;
  if (showEnd && row.endDate)
    return `${fmtDate(row.startDate, { mode: "short" })} – ${fmtDate(row.endDate, { mode: "short" })}`;
  if (row.startDate) return fmtDate(row.startDate, { mode: "short" });
  return "";
}

/**
 * Builds the paginated advisor list for current or past firm rosters.
 * @param firmId - Firm identifier.
 * @param status - Roster filter: "current" or "past".
 * @param opts - Date display options passed through to each row.
 * @returns Paginated advisor list node.
 */
export function paginatedAdvisors(
  firmId: string,
  status: "current" | "past",
  opts?: AdvisorRowOptions
): HTMLElement {
  return PaginatedC<FirmAdvisorPublicRow>({
    fetchPage: async cursor => {
      const qs = new URLSearchParams({ status, limit: "50" });
      if (cursor) qs.set("cursor", cursor);
      const response: FirmAdvisorsResponse = await api(
        `/FirmAdvisors/${encodeURIComponent(firmId)}?${qs}`
      );
      return response;
    },
    empty:
      status === "past"
        ? "No past advisors on file."
        : "No current advisors on file.",
    renderRow: r => advisorRow(r, opts),
  });
}
