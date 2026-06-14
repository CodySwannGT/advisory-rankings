// Per-module due-diligence cards (recruiting, roster, ranking, regulatory, coverage).

import type {
  CoverageTimelineModule,
  FirmArticleStubView,
  RankingAppearance,
  RankingPresenceModule,
  RecruitingMomentumModule,
  RegulatorySnapshotModule,
  RosterFootprintModule,
} from "../../harper/resource-firm-due-diligence-types.js";
import { articlePath, fmtDate, fmtMoney } from "../app.js";
import { el } from "../design-system/index.js";
import {
  CLASS_LIST,
  CLASS_LIST_ROW,
  CLASS_STAT_ROW,
  COPY_NOT_LOADED,
  CoverageArticleExtras,
  EmptyTextComponent,
  SourceAttributionComponent,
  STATUS_LOADED,
} from "./shared.js";
import { fmtNumber, metricTile, signedMoney, signedNumber } from "./helpers.js";
import { moduleCard, recentMovesList } from "./module-shell.js";

/**
 * Builds the recruiting module.
 * @param module - Recruiting module payload.
 * @returns Module card.
 */
export function recruitingMomentumCard(
  module: RecruitingMomentumModule | null | undefined
): HTMLElement {
  return moduleCard(
    "Recruiting momentum",
    module,
    el(
      "div",
      { class: CLASS_STAT_ROW },
      metricTile(
        "Inbound",
        fmtNumber(module?.inbound?.count),
        fmtMoney(module?.inbound?.knownAum || 0)
      ),
      metricTile(
        "Outbound",
        fmtNumber(module?.outbound?.count),
        fmtMoney(module?.outbound?.knownAum || 0)
      ),
      metricTile(
        "Net moves",
        signedNumber(module?.netMoveCount),
        signedMoney(module?.netAumMoved)
      )
    ),
    module?.inbound?.unknownAumCount || module?.outbound?.unknownAumCount
      ? el(
          "p",
          { class: "firm-dd-missing" },
          `${fmtNumber((module?.inbound?.unknownAumCount || 0) + (module?.outbound?.unknownAumCount || 0))} move(s) have unknown AUM.`
        )
      : null,
    recentMovesList(module?.recentMoves || [])
  );
}

/**
 * Builds the roster module.
 * @param module - Roster module payload.
 * @returns Module card.
 */
export function rosterFootprintCard(
  module: RosterFootprintModule | null | undefined
): HTMLElement {
  return moduleCard(
    "Roster footprint",
    module,
    el(
      "div",
      { class: CLASS_STAT_ROW },
      metricTile("Current advisors", fmtNumber(module?.currentAdvisorCount)),
      metricTile("Past advisors", fmtNumber(module?.pastAdvisorCount)),
      metricTile("Teams", fmtNumber(module?.teamCount)),
      metricTile("Branches", fmtNumber(module?.branchCount))
    )
  );
}

/**
 * Builds the ranking module.
 * @param module - Ranking module payload.
 * @returns Module card.
 */
export function rankingPresenceCard(
  module: RankingPresenceModule | null | undefined
): HTMLElement {
  const appearances: readonly RankingAppearance[] = module?.appearances || [];
  const topRank =
    module && module.status === STATUS_LOADED ? module.topRank : null;
  return moduleCard(
    "Ranking presence",
    module,
    appearances.length
      ? el(
          "div",
          { class: CLASS_LIST },
          ...appearances
            .slice(0, 4)
            .map(appearance =>
              el(
                "div",
                { class: CLASS_LIST_ROW },
                el(
                  "span",
                  {},
                  [
                    appearance.ranking?.year,
                    appearance.ranking?.name || "Unresolved ranking",
                    appearance.subjectType,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                ),
                el(
                  "strong",
                  {},
                  appearance.rank ? `#${appearance.rank}` : "rank pending"
                )
              )
            )
        )
      : EmptyTextComponent({
          children: "No ranking appearances are loaded for this firm yet.",
        }),
    el(
      "div",
      { class: CLASS_STAT_ROW },
      metricTile("Resolved", fmtNumber(module?.resolvedCount)),
      metricTile("Unresolved", fmtNumber(module?.unresolvedCount)),
      metricTile("Top rank", topRank ? `#${topRank}` : COPY_NOT_LOADED)
    )
  );
}

/**
 * Builds the regulatory module.
 * @param module - Regulatory module payload.
 * @returns Module card.
 */
export function regulatorySnapshotCard(
  module: RegulatorySnapshotModule | null | undefined
): HTMLElement {
  const snapshot =
    module && module.status === STATUS_LOADED ? module.snapshot : null;
  return moduleCard(
    "Regulatory snapshot",
    module,
    snapshot
      ? el(
          "div",
          { class: CLASS_STAT_ROW },
          metricTile("Disclosures", fmtNumber(snapshot.disclosureCount)),
          metricTile("BD scope", snapshot.bcScope || COPY_NOT_LOADED),
          metricTile("IA scope", snapshot.iaScope || COPY_NOT_LOADED),
          metricTile(
            "State registrations",
            fmtNumber(snapshot.registeredStateCount)
          )
        )
      : EmptyTextComponent({
          children:
            module?.status === STATUS_LOADED
              ? "Regulatory values are backed by FINRA BrokerCheck."
              : "No FINRA BrokerCheck snapshot is loaded for this firm yet.",
        }),
    module?.source
      ? SourceAttributionComponent({
          source: module.source.sourceName,
          url: module.source.sourceUrl,
          termsUrl: module.source.termsUrl,
          fetchedAt: module.source.compiledAsOf,
        })
      : null
  );
}

/**
 * Builds the coverage module.
 * @param module - Coverage module payload.
 * @returns Module card.
 */
export function coverageTimelineCard(
  module: CoverageTimelineModule | null | undefined
): HTMLElement {
  const articles: readonly FirmArticleStubView[] = module?.recentArticles || [];
  return moduleCard(
    "Coverage timeline",
    module,
    articles.length
      ? el(
          "div",
          { class: CLASS_LIST },
          ...articles.slice(0, 4).map(article => {
            const articleAny = article as FirmArticleStubView &
              CoverageArticleExtras;
            return el(
              "a",
              {
                class: `${CLASS_LIST_ROW} firm-dd-link-row`,
                href: articleAny.url || articlePath(article),
                target: articleAny.url ? "_blank" : null,
                rel: articleAny.url ? "noreferrer" : null,
              },
              el("span", {}, articleAny.headline || "Untitled article"),
              el(
                "strong",
                {},
                articleAny.publishedDate
                  ? fmtDate(articleAny.publishedDate, { mode: "short" })
                  : "undated"
              )
            );
          })
        )
      : EmptyTextComponent({
          children: "No article coverage is loaded for this firm yet.",
        }),
    metricTile("Articles on file", fmtNumber(module?.articleCount), "articles")
  );
}
