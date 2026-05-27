import { el, clear } from "./dom.js";
import { Button } from "./atoms.js";
import * as Search from "./organisms-search.js";

/**
 * Normalized `/Me` response consumed by the navbar.
 *
 * Produced by `src/web/app.ts#refreshMe`, which is still `@ts-nocheck`'d in
 * a parallel change. Restated here so the navbar can render auth state
 * without leaning on `any`. All fields are optional because the producer
 * may emit an authenticated payload, an unauthenticated payload, or a
 * temporary fallback when `/Me` fails.
 */
export interface NavbarMe {
  readonly authenticated?: boolean;
  readonly authUnavailable?: boolean;
  readonly message?: string;
  readonly username?: string;
}

/**
 * Adapter for a single global-search request used by the header search box.
 * Mirrors `app.ts#search`, but kept narrow so the organism only depends on
 * what it actually consumes.
 */
export type NavbarSearch = (query: string) => Promise<unknown>;

/** Optional refresher that resolves the current `/Me` snapshot. */
export type NavbarRefreshMe = () => Promise<NavbarMe>;

/** Optional logout handler invoked by the sign-out affordance. */
export type NavbarLogout = () => void;

/** Navbar rendering options. */
export interface NavbarOptions {
  readonly active?: string;
  readonly refreshMe?: NavbarRefreshMe;
  readonly logout?: NavbarLogout;
  readonly search?: NavbarSearch;
}

/**
 * Typed view of the `organisms-search.ts` exports actually consumed by
 * this organism. The producer module is still `@ts-nocheck`'d in a
 * parallel change, so its inferred shapes leak `any`s that don't match
 * the real contract. This shim restates the contract once.
 */
/** Option bag forwarded to the underlying `GlobalSearch` organism. */
interface GlobalSearchShimOptions {
  readonly search?: NavbarSearch;
}

/** Typed view of `organisms-search.ts` consumed via {@link SearchModule}. */
interface SearchShim {
  readonly GlobalSearch: (options: GlobalSearchShimOptions) => HTMLElement;
}

/**
 * Single `unknown` adapter cast for the whole `organisms-search` module —
 * see {@link SearchShim}. Restated as one local module-level cast so the
 * public navbar code can call typed wrappers below.
 */
const SearchModule = Search as unknown as SearchShim;

const DRAWER_OPEN_CLASS = "drawer-open";

/**
 * Returns the current open/closed state of the mobile drawer by reading
 * the body class that {@link toggleDrawer} owns. The DOM is the single
 * source of truth so the organism stays free of mutable in-memory state
 * — satisfying `functional/immutable-data` without a class escape hatch.
 * @returns True when the drawer is currently open.
 */
function isDrawerOpen(): boolean {
  return document.body.classList.contains(DRAWER_OPEN_CLASS);
}

/** Render context shared by the auth helpers. */
interface MeRenderContext {
  readonly meSpot: HTMLElement;
  readonly me: NavbarMe;
  readonly logout?: NavbarLogout;
}

/** Drawer focus-state context. */
interface DrawerFocusContext {
  readonly drawer: HTMLElement;
  readonly open: boolean;
}

/** Keyboard close context shared with the global listener. */
interface DrawerKeyboardContext {
  readonly event: KeyboardEvent;
  readonly burger: HTMLElement;
  readonly drawer: HTMLElement;
}

/**
 * Sticky top navigation with search, auth status, and a mobile drawer.
 * @param root0 - Navigation state and API adapters.
 * @param root0.active - Current section name for active-link styling.
 * @param root0.refreshMe - Optional session loader for the auth affordance.
 * @param root0.logout - Optional logout handler used by the sign-out button.
 * @param root0.search - Optional global search adapter.
 * @returns Fully wired navigation element.
 */
export function Navbar({
  active,
  refreshMe,
  logout,
  search,
}: NavbarOptions = {}): HTMLElement {
  const meSpot = createMeSpot();
  const links = createLinks(active);
  const burger = createBurger(() => toggleDrawer(burger, drawer));
  const drawer = el("div", { class: "nav-drawer" }, links, meSpot);
  const scrim = el("div", {
    class: "nav-scrim",
    onClick: () => toggleDrawer(burger, drawer, false),
  });
  const mobileDrawerQuery = window.matchMedia("(max-width: 700px)");
  syncDrawerFocusState({ drawer, open: false });
  mobileDrawerQuery.addEventListener("change", () =>
    syncDrawerFocusState({ drawer, open: isDrawerOpen() })
  );
  document.addEventListener("keydown", event =>
    closeDrawerFromKeyboard({ event, burger, drawer })
  );

  links.addEventListener("click", event => {
    if (isLinkActivation(event)) toggleDrawer(burger, drawer, false);
  });
  if (refreshMe) refreshMe().then(me => renderMe({ meSpot, me, logout }));

  return el(
    "nav",
    { class: "nav" },
    burger,
    el("div", { class: "logo" }, el("a", { href: "/" }, "AdvisorBook")),
    SearchModule.GlobalSearch({ search }),
    drawer,
    scrim
  );
}

/**
 * Detects clicks on anchor elements (or their descendants) inside the
 * drawer link list so the drawer auto-closes after navigation.
 * @param event - Click event captured on the link container.
 * @returns True when the event originated inside an `<a>` element.
 */
function isLinkActivation(event: Event): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  return target.tagName === "A" || target.closest("a") !== null;
}

/**
 * Creates the auth status container shown in the drawer.
 * @returns Placeholder container while session state loads.
 */
function createMeSpot(): HTMLElement {
  return el("div", { class: "me-spot" }, el("span", { class: "me-loading" }));
}

/**
 * Creates top-level navigation links with the active section marked.
 * @param active - Current section name.
 * @returns Link container for desktop and drawer layouts.
 */
function createLinks(active: string | undefined): HTMLElement {
  const link = (href: string, label: string): HTMLElement =>
    el(
      "a",
      { href, class: active === label.toLowerCase() ? "active" : null },
      label
    );
  return el(
    "div",
    { class: "nav-links" },
    link("/", "Home"),
    link("/firms", "Firms"),
    link("/recruiting", "Recruiting"),
    link("/rankings", "Rankings"),
    link("/advisors", "Advisors"),
    link("/teams", "Teams")
  );
}

/**
 * Creates the mobile drawer button.
 * @param onClick - Toggle callback wired to the button.
 * @returns Hamburger button with accessibility state.
 */
function createBurger(onClick: EventListener): HTMLElement {
  return el(
    "button",
    {
      class: "nav-burger",
      "aria-label": "Open menu",
      "aria-expanded": "false",
      onClick,
    },
    el("span"),
    el("span"),
    el("span")
  );
}

/**
 * Renders the signed-in user or sign-in link after the session request resolves.
 * @param root0 - Auth render context.
 * @param root0.meSpot - Container reserved for auth controls.
 * @param root0.me - Normalized `/Me` response.
 * @param root0.logout - Optional logout handler for the sign-out button.
 */
function renderMe({ meSpot, me, logout }: MeRenderContext): void {
  clear(meSpot);
  if (me?.authenticated && typeof me.username === "string") {
    renderSignedInUser({ meSpot, me, logout });
    return;
  }
  if (me?.authUnavailable) renderSessionFallback(meSpot, me.message);
  renderSignInLink(meSpot);
}

/**
 * Renders username and sign-out action for authenticated visitors.
 * @param root0 - Auth render context.
 * @param root0.meSpot - Container reserved for auth controls.
 * @param root0.me - Normalized authenticated user response.
 * @param root0.logout - Optional logout handler.
 */
function renderSignedInUser({ meSpot, me, logout }: MeRenderContext): void {
  const username = me.username ?? "";
  meSpot.appendChild(
    el("span", { class: "me-user", title: username }, username.split("@")[0])
  );
  meSpot.appendChild(
    Button({
      variant: "neutral",
      attrs: { class: "me-action" },
      onClick: event => {
        event.preventDefault();
        if (logout) logout();
      },
      children: "Sign out",
    })
  );
}

/**
 * Renders the fallback login link when no session is active.
 * @param meSpot - Container reserved for auth controls.
 */
function renderSignInLink(meSpot: HTMLElement): void {
  meSpot.appendChild(
    el("a", { class: "me-action", href: "/login.html" }, "Sign in")
  );
}

/**
 * Renders safe recovery guidance when the session check fails.
 * @param meSpot - Container reserved for auth controls.
 * @param message - Public-facing fallback copy.
 */
function renderSessionFallback(
  meSpot: HTMLElement,
  message: string | undefined
): void {
  meSpot.appendChild(
    el(
      "span",
      { class: "me-session-note", role: "status" },
      message || "Session status is temporarily unavailable."
    )
  );
}

/**
 * Opens or closes the mobile drawer and mirrors state to ARIA.
 * @param burger - Button whose expanded state should match the drawer.
 * @param drawer - Drawer whose focusability should match mobile visibility.
 * @param force - Optional explicit drawer state.
 */
function toggleDrawer(
  burger: HTMLElement,
  drawer: HTMLElement,
  force?: boolean
): void {
  const open = force ?? !isDrawerOpen();
  document.body.classList.toggle(DRAWER_OPEN_CLASS, open);
  burger.setAttribute("aria-expanded", String(open));
  syncDrawerFocusState({ drawer, open });
}

/**
 * Removes the off-canvas mobile drawer from tab order while it is closed.
 * @param root0 - Drawer focus context.
 * @param root0.drawer - Drawer element to expose or hide from focus.
 * @param root0.open - Whether the drawer is currently open.
 */
function syncDrawerFocusState({ drawer, open }: DrawerFocusContext): void {
  const mobile = window.matchMedia("(max-width: 700px)").matches;
  const hidden = mobile && !open;
  drawer.toggleAttribute("inert", hidden);
  drawer.setAttribute("aria-hidden", String(hidden));
}

/**
 * Closes the mobile drawer from keyboard dismissal without hijacking other keys.
 * @param root0 - Keyboard close context.
 * @param root0.event - Key event to inspect.
 * @param root0.burger - Button whose expanded state should match the drawer.
 * @param root0.drawer - Drawer whose focusability should match mobile visibility.
 */
function closeDrawerFromKeyboard({
  event,
  burger,
  drawer,
}: DrawerKeyboardContext): void {
  if (event.key === "Escape" && isDrawerOpen())
    toggleDrawer(burger, drawer, false);
}
