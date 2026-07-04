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
import { Heading, Icon } from "./atoms.js";
import type { IconName } from "./atoms-icons.js";
import { BrowseCard, Navbar, SiteFooter } from "./organisms.js";
import type {
  BrowseCardItem,
  BrowseCardOptions,
} from "./organisms-core-types.js";
import type { SearchAdapter } from "./organisms-search.js";

/** Typed adapter for the currently untyped navigation organism export. */
type NavbarAdapter = (options: NavbarOptions) => HTMLElement;
/** Typed adapter for the currently untyped footer organism export. */
type SiteFooterAdapter = () => HTMLElement;
/** Typed adapter for the currently untyped browse-card organism export. */
type BrowseCardAdapter = (options: BrowseCardOptions) => HTMLElement;
/** Optional session refresh function consumed by the navigation organism. */
type SessionLoader = () => Promise<unknown>;
/** Optional sign-out handler consumed by the navigation organism. */
type LogoutHandler = () => void;

/** Shared template options forwarded to the global page chrome. */
interface BaseTemplateOptions {
  readonly active?: string;
  readonly refreshMe?: SessionLoader;
  readonly logout?: LogoutHandler;
  readonly search?: SearchAdapter;
  readonly pageTitle?: string;
}

/** Navigation option bag forwarded by each template shell. */
interface NavbarOptions extends BaseTemplateOptions {}

/** Column references passed to three-column route builders. */
interface ThreeColumnBuildContext {
  readonly left: HTMLElement;
  readonly center: HTMLElement;
  readonly right: HTMLElement;
  readonly layout: HTMLElement;
}

/** Column references passed to single-column route builders. */
interface FullWidthBuildContext {
  readonly center: HTMLElement;
  readonly layout: HTMLElement;
}

/** Route callback that populates a three-column page shell. */
type ThreeColumnBuilder = (context: ThreeColumnBuildContext) => void;
/** Route callback that populates a single-column page shell. */
type FullWidthBuilder = (context: FullWidthBuildContext) => void;

/** Options for mounting the standard public three-column page shell. */
interface ThreeColumnPageOptions extends BaseTemplateOptions {
  readonly build?: ThreeColumnBuilder;
}

/** Options for mounting a full-width single-column page shell. */
interface FullWidthPageOptions extends BaseTemplateOptions {
  readonly build?: FullWidthBuilder;
}

/** Options for mounting a narrow centered single-column page shell. */
interface CenteredNarrowPageOptions extends FullWidthPageOptions {
  readonly maxWidth?: number | string;
}

const renderNavbar = Navbar as unknown as NavbarAdapter;
const renderSiteFooter = SiteFooter as unknown as SiteFooterAdapter;
const renderBrowseCard = BrowseCard as unknown as BrowseCardAdapter;

const ANALYST_ROLES = new Set(["analyst", "super_user", "super", "admin"]);

/** Declarative Browse route entry used to render public and analyst rails. */
interface BrowseItemConfig {
  readonly activeKey: string;
  readonly href: string;
  readonly icon: IconName;
  readonly label: string;
}

const PUBLIC_BROWSE_ITEMS: readonly BrowseItemConfig[] = [
  { label: "Home", icon: "home", href: "/", activeKey: "home" },
  { label: "Firms", icon: "building", href: "/firms", activeKey: "firms" },
  {
    label: "Branches",
    icon: "branches",
    href: "/branches",
    activeKey: "branches",
  },
  {
    label: "Coverage",
    icon: "coverage",
    href: "/coverage",
    activeKey: "coverage",
  },
  {
    label: "Investor proof",
    icon: "coverage",
    href: "/investor-proof",
    activeKey: "investor-proof",
  },
  {
    label: "MCP gallery",
    icon: "research",
    href: "/mcp-gallery",
    activeKey: "mcp-gallery",
  },
  {
    label: "Source triage",
    icon: "research",
    href: "/source-triage",
    activeKey: "source-triage",
  },
  {
    label: "Recruiting",
    icon: "recruiting",
    href: "/recruiting",
    activeKey: "recruiting",
  },
  {
    label: "Rankings",
    icon: "rankings",
    href: "/rankings",
    activeKey: "rankings",
  },
  {
    label: "Advisors",
    icon: "advisor",
    href: "/advisors",
    activeKey: "advisors",
  },
  { label: "Teams", icon: "teams", href: "/teams", activeKey: "teams" },
  {
    label: "Watchlists",
    icon: "watchlist",
    href: "/watchlists",
    activeKey: "watchlists",
  },
  {
    label: "Compliance",
    icon: "compliance",
    href: "/regulatory",
    activeKey: "regulatory",
  },
];

const ANALYST_BROWSE_ITEMS: readonly BrowseItemConfig[] = [
  {
    label: "Research queue",
    icon: "research",
    href: "/research/freshness",
    activeKey: "research",
  },
  {
    label: "Discrepancies",
    icon: "discrepancies",
    href: "/regulatory/discrepancies",
    activeKey: "regulatory",
  },
];

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
}: ThreeColumnPageOptions = {}): void {
  const layout = el("div", { class: "layout" });
  const left = el("aside", { class: "left rail" });
  const center = el("section", { class: "center" });
  const right = el("aside", { class: "right rail" });
  document.body.appendChild(
    renderNavbar({ active, refreshMe, logout, search })
  );
  document.body.appendChild(layout);
  document.body.appendChild(renderSiteFooter());
  appendPageTitle(layout, pageTitle);
  left.appendChild(primaryBrowseCard(active));
  layout.append(left, center, right);
  refreshMe?.()
    .then(me => updateBrowseCardForSession(left, active, me))
    .catch(() => undefined);

  runBuilder(build, { left, center, right, layout });
}

/**
 * Builds the left-rail browse navigation shared by public pages.
 * @param active - Current route key for active-row styling.
 * @param session - Optional `/Me` session envelope.
 * @returns Browse card with the primary site sections.
 */
export function primaryBrowseCard(
  active?: string,
  session?: unknown
): HTMLElement {
  return renderBrowseCard({
    items: primaryBrowseItems(active, session),
  });
}

/**
 * Builds the canonical Browse rail entries for public and analyst sessions.
 * @param active - Current route key for active-row styling.
 * @param session - Optional `/Me` session envelope.
 * @returns Ordered Browse navigation entries.
 */
export function primaryBrowseItems(
  active?: string,
  session?: unknown
): readonly BrowseCardItem[] {
  const publicItems = PUBLIC_BROWSE_ITEMS.map(item => browseItem(item, active));
  if (!hasAnalystRole(session)) return publicItems;
  return [
    ...publicItems,
    ...ANALYST_BROWSE_ITEMS.map(item => browseItem(item, active)),
  ];
}

/**
 * Creates one Browse item with a named design-system icon.
 * @param item - Declarative Browse route entry.
 * @param active - Current route key for active-row styling.
 * @returns Browse navigation item.
 */
function browseItem(
  item: BrowseItemConfig,
  active: string | undefined
): BrowseCardItem {
  return {
    label: item.label,
    icon: Icon({ name: item.icon }),
    href: item.href,
    active: active === item.activeKey,
  };
}

/**
 * Refreshes the default Browse card once session state resolves.
 * @param left - Left rail containing the initial Browse card.
 * @param active - Current route key for active-row styling.
 * @param session - Resolved `/Me` session envelope.
 */
function updateBrowseCardForSession(
  left: HTMLElement,
  active: string | undefined,
  session: unknown
): void {
  const current = left.querySelector(".card");
  if (!current) return;
  current.replaceWith(primaryBrowseCard(active, session));
}

/**
 * Checks whether the current session can see analyst-only navigation.
 * @param session - Optional `/Me` session envelope.
 * @returns True when the user has an analyst or elevated role.
 */
function hasAnalystRole(session: unknown): boolean {
  if (!session || typeof session !== "object") return false;
  const authenticated = Reflect.get(session, "authenticated") === true;
  const role = roleValue(Reflect.get(session, "role"));
  return authenticated && ANALYST_ROLES.has(role);
}

/**
 * Normalizes flat or nested Harper role values.
 * @param value - Role value from `/Me`.
 * @returns Role name or empty string.
 */
function roleValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const nested = Reflect.get(value, "role");
    return typeof nested === "string" ? nested : "";
  }
  return "";
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
}: FullWidthPageOptions = {}): void {
  const layout = el("div", { class: "layout" });
  const center = el("section", {
    class: "center",
    style: "grid-column: 1 / -1;",
  });
  document.body.appendChild(
    renderNavbar({ active, refreshMe, logout, search })
  );
  document.body.appendChild(layout);
  document.body.appendChild(renderSiteFooter());
  appendPageTitle(layout, pageTitle);
  layout.appendChild(center);

  runBuilder(build, { center, layout });
}

// ─── CenteredNarrowLayout ─────────────────────────────────────
// Single narrow centered column (used by the login shell).
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
}: CenteredNarrowPageOptions = {}): void {
  const layout = el("div", { class: "layout" });
  const center = el("section", {
    class: "center",
    style: `grid-column: 1 / -1; max-width: ${maxWidth}px; margin: 32px auto;`,
  });
  document.body.appendChild(
    renderNavbar({ active, refreshMe, logout, search })
  );
  document.body.appendChild(layout);
  document.body.appendChild(renderSiteFooter());
  appendPageTitle(layout, pageTitle);
  layout.appendChild(center);

  runBuilder(build, { center, layout });
}

/**
 * Adds the single document-level heading for page semantics without changing
 * the visible card hierarchy that route content owns.
 * @param root - Layout root that should contain the heading.
 * @param pageTitle - Route purpose label.
 */
function appendPageTitle(root: HTMLElement, pageTitle?: string): void {
  if (!pageTitle) return;
  root.appendChild(
    Heading({
      level: 1,
      attrs: { class: "ab-page-title" },
      children: pageTitle,
    })
  );
}

/**
 * Preserves the previous runtime contract: callers must supply a build
 * callback even though the public template option bag is optional.
 * @param build - Route callback that populates the page shell.
 * @param context - Mounted column references.
 */
function runBuilder<Context>(
  build: ((context: Context) => void) | undefined,
  context: Context
): void {
  if (typeof build !== "function")
    throw new TypeError("build is not a function");
  build(context);
}
