// @ts-nocheck
// Public Compliance page.
// Renders disclosure event coverage from the shared feed resource while keeping
// page behavior in TypeScript source instead of checked-in inline HTML.

import {
  api,
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
  EntityRow,
  Heading,
  DisclosureEventCard,
  clear,
} from "./design-system/index.js";

/**
 * Loads and renders compliance disclosures from the feed resource.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function loadCompliance(center, right) {
  clear(center);
  clear(right);
  api("/Feed")
    .then(({ items }) => {
      renderCompliance(disclosureEvents(items), center, right);
    })
    .catch(error => {
      renderComplianceError(error, center, right);
    });
}

/**
 * Extracts disclosure cards from feed items.
 * @param items - Feed items with optional event cards.
 * @returns First disclosure event cards.
 */
function disclosureEvents(items) {
  return (items || [])
    .flatMap(item =>
      (item.eventCards || []).filter(card => card.kind === "disclosure")
    )
    .slice(0, 25);
}

/**
 * Renders the compliance page body and right rail.
 * @param disclosures - Disclosure event cards.
 * @param center - Main content column.
 * @param right - Right rail column.
 */
function renderCompliance(disclosures, center, right) {
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
function complianceEventsCard(disclosures) {
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
function regulatorsCard(disclosures) {
  const regulators = new Set(
    disclosures
      .map(disclosure => humanize(disclosure.regulator))
      .filter(Boolean)
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
function advisorsCard(disclosures) {
  return SectionCard({
    body: [
      Heading({
        level: 3,
        attrs: { class: "card-subtitle" },
        children: "Advisors",
      }),
      EntityList({
        rows: disclosures.map(disclosure =>
          EntityRow({
            avatar: "⚠",
            name: disclosure.advisor.name,
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
function renderComplianceError(error, center, right) {
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
  active: "home",
  refreshMe,
  logout,
  search,
  pageTitle: "Compliance events",
  build({ center, right }) {
    loadCompliance(center, right);
  },
});
