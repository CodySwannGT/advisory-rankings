// Public Compliance page.
// Renders disclosure event coverage from the shared feed resource while keeping
// page behavior in TypeScript source instead of checked-in inline HTML.

import type {
  DisclosureEventCard as DisclosureEventCardPayload,
  FeedEventCard,
  FeedItem,
} from "../harper/resource-feed-types.js";
import {
  api as rawApi,
  refreshMe,
  logout,
  search,
  fmts,
  humanize,
  entityPath,
} from "./app.js";
import {
  mountThreeColumnPage,
  SectionCard,
  AsyncStateCard,
  EntityList,
  Heading,
  DisclosureEventCard,
  clear,
} from "./design-system/index.js";
import { EntityRowC } from "./design-system-adapters.js";

/** Feed payload returned by the `/Feed` resource. */
interface FeedPayload {
  readonly items?: readonly FeedItem[];
}

/**
 * Typed wrapper for the shared `app.js` `api` helper. The producer in
 * `app.ts` still opts out of TypeScript and leaks `any` across the module
 * boundary; this is the single permitted adapter cast for this page.
 */
const api = rawApi as unknown as (path: string) => Promise<FeedPayload>;

/**
 * Loads and renders compliance disclosures from the feed resource.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function loadCompliance(center: HTMLElement, right: HTMLElement): void {
  clear(center);
  clear(right);
  api("/Feed?mode=compliance-disclosures&limit=100")
    .then(payload => {
      renderCompliance(disclosureEvents(payload.items ?? []), center, right);
    })
    .catch((error: unknown) => {
      renderComplianceError(error, center, right);
    });
}

/**
 * Extracts disclosure cards from feed items.
 * @param items - Feed items with optional event cards.
 * @returns First disclosure event cards.
 */
function disclosureEvents(
  items: readonly FeedItem[]
): readonly DisclosureEventCardPayload[] {
  return items
    .flatMap(item => (item.eventCards ?? []).filter(isDisclosureCard))
    .slice(0, 25);
}

/**
 * Narrows a feed event card to its disclosure variant.
 * @param card - Either kind of feed event card.
 * @returns True when the card is a disclosure event.
 */
function isDisclosureCard(
  card: FeedEventCard
): card is DisclosureEventCardPayload {
  return card.kind === "disclosure";
}

/**
 * Renders the compliance page body and right rail.
 * @param disclosures - Disclosure event cards.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function renderCompliance(
  disclosures: readonly DisclosureEventCardPayload[],
  center: HTMLElement,
  right: HTMLElement
): void {
  const advisors = disclosures
    .filter(disclosure => disclosure.advisor)
    .slice(0, 8);
  center.appendChild(complianceEventsCard(disclosures));
  right.appendChild(regulatorsCard(disclosures));
  if (advisors.length) right.appendChild(advisorsCard(advisors));
}

/**
 * Builds the primary disclosure events card.
 * @param disclosures - Disclosure event cards.
 * @returns Section card for compliance events.
 */
function complianceEventsCard(
  disclosures: readonly DisclosureEventCardPayload[]
): HTMLElement {
  return SectionCard({
    title: `Compliance events (${disclosures.length.toLocaleString()})`,
    body: disclosures.length
      ? disclosures.map(disclosure => DisclosureEventCard(disclosure, fmts))
      : "No compliance events on file.",
  });
}

/**
 * Builds the regulator summary rail card.
 * @param disclosures - Disclosure event cards.
 * @returns Section card for regulators.
 */
function regulatorsCard(
  disclosures: readonly DisclosureEventCardPayload[]
): HTMLElement {
  const regulators = new Set(
    disclosures
      .map(disclosure => humanize(disclosure.regulator))
      .filter((label): label is string => Boolean(label))
  );
  return SectionCard({
    body: [
      Heading({
        level: 3,
        attrs: { class: "card-subtitle" },
        children: "Regulators",
      }),
      regulators.size ? [...regulators].join(", ") : "None on file",
    ],
  });
}

/**
 * Builds the advisors rail card.
 * @param disclosures - Disclosure event cards with advisor payloads.
 * @returns Section card for advisors.
 */
function advisorsCard(
  disclosures: readonly DisclosureEventCardPayload[]
): HTMLElement {
  return SectionCard({
    body: [
      Heading({
        level: 3,
        attrs: { class: "card-subtitle" },
        children: "Advisors",
      }),
      EntityList({
        rows: disclosures.map(disclosure =>
          EntityRowC({
            avatar: "⚠",
            name: disclosure.advisor?.name,
            sub: [
              humanize(disclosure.regulator),
              humanize(disclosure.disclosureType),
            ]
              .filter(Boolean)
              .join(" · "),
            href: entityPath("advisor", disclosure.advisor),
          })
        ),
      }),
    ],
  });
}

/**
 * Renders a transient compliance loading error with retry.
 * @param error - Failed resource request.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function renderComplianceError(
  error: unknown,
  center: HTMLElement,
  right: HTMLElement
): void {
  console.error("Compliance events failed to load", error);
  clear(center);
  clear(right);
  center.appendChild(
    AsyncStateCard({
      kind: "transient",
      title: "Could not load compliance events",
      body: "Retry the request to refresh compliance events.",
      actionLabel: "Retry",
      onAction: () => loadCompliance(center, right),
    })
  );
}

mountThreeColumnPage({
  active: "regulatory",
  refreshMe,
  logout,
  search,
  pageTitle: "Compliance events",
  build({ center, right }) {
    loadCompliance(center, right);
  },
});
