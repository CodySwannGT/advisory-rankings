// @ts-nocheck
// AdvisorBook · Atomic Design — TEMPLATES
//
// Page-level layout shells. Templates own the global chrome
// (Navbar, SiteFooter) and the content grid; they hand the
// caller back the placeholder elements (left / center / right
// rails) to populate.
//
// Templates may import from atoms / molecules / organisms.
// Pages should call exactly one template and never hand-roll
// chrome elsewhere.

import { el } from "./dom.js";
import { Heading } from "./atoms.js";
import { BrowseCard, Navbar, SiteFooter } from "./organisms.js";

// ─── ThreeColumnLayout ────────────────────────────────────────
// The default page shell: sticky navbar, three-column grid
// (left rail | center column | right rail), site footer. The
// rails collapse on tablet / mobile breakpoints (see app.css).
//
//   mountThreeColumnPage({
//     active: 'home',
//     refreshMe, logout, search,        // injected from app.js
//     build: ({ left, center, right }) => { … }
//   })
/**
 * Handles mount three column page for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.active - active used by this operation.
 * @param root0.refreshMe - refresh me used by this operation.
 * @param root0.logout - logout used by this operation.
 * @param root0.search - search used by this operation.
 * @param root0.pageTitle - page title exposed as the route-level h1.
 * @param root0.build - build used by this operation.
 * @returns The computed value.
 */
export function mountThreeColumnPage({
  active,
  refreshMe,
  logout,
  search,
  pageTitle,
  build,
} = {}) {
  const layout = el("div", { class: "layout" });
  const left = el("aside", { class: "left rail" });
  const center = el("section", { class: "center" });
  const right = el("aside", { class: "right rail" });
  document.body.appendChild(Navbar({ active, refreshMe, logout, search }));
  document.body.appendChild(layout);
  document.body.appendChild(SiteFooter());
  appendPageTitle(layout, pageTitle);
  left.appendChild(primaryBrowseCard());
  layout.append(left, center, right);

  build({ left, center, right, layout });
}

/**
 * Builds the left-rail browse navigation shared by public pages.
 * @returns Browse card with the primary site sections.
 */
function primaryBrowseCard() {
  return BrowseCard({
    items: [
      { label: "Home", icon: "🏠", href: "/" },
      { label: "Firms", icon: "🏢", href: "/firms" },
      { label: "Recruiting", icon: "↔", href: "/recruiting" },
      { label: "Rankings", icon: "#", href: "/rankings" },
      { label: "Advisors", icon: "👤", href: "/advisors" },
      { label: "Teams", icon: "🤝", href: "/teams" },
      { label: "Compliance", icon: "⚖️", href: "/regulatory" },
    ],
  });
}

// ─── FullWidthLayout ──────────────────────────────────────────
// Single full-width column inside the same .layout grid. Reserve this
// for exceptional utility pages; public content should generally use
// mountThreeColumnPage so large screens keep both rails populated.
/**
 * Handles mount full width page for this workflow.
 * @param root0 - value used by this operation.
 * @param root0.active - active used by this operation.
 * @param root0.refreshMe - refresh me used by this operation.
 * @param root0.logout - logout used by this operation.
 * @param root0.search - search used by this operation.
 * @param root0.pageTitle - page title exposed as the route-level h1.
 * @param root0.build - build used by this operation.
 */
export function mountFullWidthPage({
  active,
  refreshMe,
  logout,
  search,
  pageTitle,
  build,
} = {}) {
  const layout = el("div", { class: "layout" });
  const center = el("section", {
    class: "center",
    style: "grid-column: 1 / -1;",
  });
  document.body.appendChild(Navbar({ active, refreshMe, logout, search }));
  document.body.appendChild(layout);
  document.body.appendChild(SiteFooter());
  appendPageTitle(layout, pageTitle);
  layout.appendChild(center);

  build({ center, layout });
}

// ─── CenteredNarrowLayout ─────────────────────────────────────
// Single narrow centered column (used by login.html).
/**
 * Mounts a narrow centered page shell for forms such as login.
 * @param root0 - value used by this operation.
 * @param root0.active - active used by this operation.
 * @param root0.refreshMe - refresh me used by this operation.
 * @param root0.logout - logout used by this operation.
 * @param root0.search - search used by this operation.
 * @param root0.pageTitle - page title exposed as the route-level h1.
 * @param root0.build - build used by this operation.
 * @param root0.maxWidth - max width used by this operation.
 */
export function mountCenteredNarrowPage({
  active,
  refreshMe,
  logout,
  search,
  pageTitle,
  build,
  maxWidth = 420,
} = {}) {
  const layout = el("div", { class: "layout" });
  const center = el("section", {
    class: "center",
    style: `grid-column: 1 / -1; max-width: ${maxWidth}px; margin: 32px auto;`,
  });
  document.body.appendChild(Navbar({ active, refreshMe, logout, search }));
  document.body.appendChild(layout);
  document.body.appendChild(SiteFooter());
  appendPageTitle(layout, pageTitle);
  layout.appendChild(center);

  build({ center, layout });
}

/**
 * Adds the single document-level heading for page semantics without changing
 * the visible card hierarchy that route content owns.
 * @param root - Layout root that should contain the heading.
 * @param pageTitle - Route purpose label.
 */
function appendPageTitle(root, pageTitle) {
  if (!pageTitle) return;
  root.appendChild(
    Heading({
      level: 1,
      attrs: { class: "ab-page-title" },
      children: pageTitle,
    })
  );
}
