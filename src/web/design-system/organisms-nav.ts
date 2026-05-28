import { el, clear } from "./dom.js";
import { Button } from "./atoms.js";
import { GlobalSearch, type SearchAdapter } from "./organisms-search.js";

/** Session payload returned by the public `/Me` helper. */
interface NavbarSession {
  readonly authenticated?: boolean;
  readonly authUnavailable?: boolean;
  readonly message?: string;
  readonly username?: string;
}

/** Options accepted by the global navigation shell. */
interface NavbarOptions {
  readonly active?: string;
  readonly refreshMe?: () => Promise<NavbarSession>;
  readonly logout?: () => void;
  readonly search?: SearchAdapter;
}

/** Render context for auth controls in the navigation drawer. */
interface MeRenderContext {
  readonly meSpot: HTMLElement;
  readonly me: NavbarSession | null | undefined;
  readonly logout?: () => void;
}

/** Render context once the session payload is known to be authenticated. */
interface SignedInRenderContext {
  readonly meSpot: HTMLElement;
  readonly me: NavbarSession;
  readonly logout?: () => void;
}

/** Context for keyboard-based drawer dismissal. */
interface KeyboardCloseContext {
  readonly event: KeyboardEvent;
  readonly burger: HTMLElement;
  readonly drawer: HTMLElement;
}

/** Context for toggling drawer focusability. */
interface DrawerFocusContext {
  readonly drawer: HTMLElement;
  readonly open: boolean | undefined;
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
    syncDrawerFocusState({ drawer, open: isDrawerOpen(burger) })
  );
  document.addEventListener("keydown", (event: KeyboardEvent) =>
    closeDrawerFromKeyboard({ event, burger, drawer })
  );

  links.addEventListener("click", event => {
    const target = event.target;
    if (
      target instanceof Element &&
      (target.tagName === "A" || target.closest("a"))
    ) {
      toggleDrawer(burger, drawer, false);
    }
  });
  if (refreshMe) refreshMe().then(me => renderMe({ meSpot, me, logout }));

  return el(
    "nav",
    { class: "nav" },
    burger,
    el("div", { class: "logo" }, el("a", { href: "/" }, "AdvisorBook")),
    GlobalSearch({ search }),
    drawer,
    scrim
  );
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
function createLinks(active?: string): HTMLElement {
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
  if (me?.authenticated) {
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
function renderSignedInUser({
  meSpot,
  me,
  logout,
}: SignedInRenderContext): void {
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
 * @param state - Shared drawer state map.
 * @param burger - Button whose expanded state should match the drawer.
 * @param drawer - Drawer whose focusability should match mobile visibility.
 * @param force - Optional explicit drawer state.
 */
function toggleDrawer(
  burger: HTMLElement,
  drawer: HTMLElement,
  force?: boolean
): void {
  const open = force ?? !isDrawerOpen(burger);
  document.body.classList.toggle("drawer-open", open);
  burger.setAttribute("aria-expanded", String(open));
  syncDrawerFocusState({ drawer, open });
}

/**
 * Reads the drawer state from the button's ARIA mirror.
 * @param burger - Drawer toggle button.
 * @returns Whether the drawer is currently expanded.
 */
function isDrawerOpen(burger: HTMLElement): boolean {
  return burger.getAttribute("aria-expanded") === "true";
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
 * @param root0.state - Shared drawer state map.
 * @param root0.burger - Button whose expanded state should match the drawer.
 * @param root0.drawer - Drawer whose focusability should match mobile visibility.
 */
function closeDrawerFromKeyboard({
  event,
  burger,
  drawer,
}: KeyboardCloseContext): void {
  if (event.key === "Escape" && isDrawerOpen(burger))
    toggleDrawer(burger, drawer, false);
}
