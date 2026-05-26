// @ts-nocheck
import { el, clear } from "./dom.js";
import { Button } from "./atoms.js";
import { GlobalSearch } from "./organisms-search.js";

/**
 * Sticky top navigation with search, auth status, and a mobile drawer.
 * @param root0 - Navigation state and API adapters.
 * @param root0.active - Current section name for active-link styling.
 * @param root0.refreshMe - Optional session loader for the auth affordance.
 * @param root0.logout - Optional logout handler used by the sign-out button.
 * @param root0.search - Optional global search adapter.
 * @returns Fully wired navigation element.
 */
export function Navbar({ active, refreshMe, logout, search } = {}) {
  const drawerState = new Map([["open", false]]);
  const mobileDrawerQuery = window.matchMedia("(max-width: 700px)");
  const meSpot = createMeSpot();
  const links = createLinks(active);
  const drawer = el("div", { class: "nav-drawer" }, links, meSpot);
  const burger = createBurger(() =>
    toggleDrawer({ state: drawerState, burger, drawer, mobileDrawerQuery })
  );
  const scrim = el("div", {
    class: "nav-scrim",
    onClick: () =>
      toggleDrawer({
        state: drawerState,
        burger,
        drawer,
        mobileDrawerQuery,
        force: false,
      }),
  });
  document.addEventListener("keydown", event =>
    closeDrawerFromKeyboard({
      event,
      state: drawerState,
      burger,
      drawer,
      mobileDrawerQuery,
    })
  );

  links.addEventListener("click", event => {
    if (event.target.tagName === "A" || event.target.closest("a"))
      toggleDrawer({
        state: drawerState,
        burger,
        drawer,
        mobileDrawerQuery,
        force: false,
      });
  });
  mobileDrawerQuery.addEventListener("change", () =>
    syncDrawerAccessibility({ state: drawerState, drawer, mobileDrawerQuery })
  );
  syncDrawerAccessibility({ state: drawerState, drawer, mobileDrawerQuery });
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
function createMeSpot() {
  return el("div", { class: "me-spot" }, el("span", { class: "me-loading" }));
}

/**
 * Creates top-level navigation links with the active section marked.
 * @param active - Current section name.
 * @returns Link container for desktop and drawer layouts.
 */
function createLinks(active) {
  const link = (href, label) =>
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
function createBurger(onClick) {
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
function renderMe({ meSpot, me, logout }) {
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
function renderSignedInUser({ meSpot, me, logout }) {
  meSpot.appendChild(
    el(
      "span",
      { class: "me-user", title: me.username },
      me.username.split("@")[0]
    )
  );
  meSpot.appendChild(
    Button({
      variant: "neutral",
      attrs: { class: "me-action" },
      onClick: event => {
        event.preventDefault();
        logout && logout();
      },
      children: "Sign out",
    })
  );
}

/**
 * Renders the fallback login link when no session is active.
 * @param meSpot - Container reserved for auth controls.
 */
function renderSignInLink(meSpot) {
  meSpot.appendChild(
    el("a", { class: "me-action", href: "/login.html" }, "Sign in")
  );
}

/**
 * Renders safe recovery guidance when the session check fails.
 * @param meSpot - Container reserved for auth controls.
 * @param message - Public-facing fallback copy.
 */
function renderSessionFallback(meSpot, message) {
  meSpot.appendChild(
    el(
      "span",
      { class: "me-session-note", role: "status" },
      message || "Session status is temporarily unavailable."
    )
  );
}

/**
 * Opens or closes the mobile drawer and mirrors state to ARIA/focusability.
 * @param root0 - Drawer toggle context.
 * @param root0.state - Shared drawer state map.
 * @param root0.burger - Button whose expanded state should match the drawer.
 * @param root0.drawer - Drawer element whose focusability should match state.
 * @param root0.mobileDrawerQuery - Media query that distinguishes desktop nav from mobile drawer.
 * @param root0.force - Optional explicit drawer state.
 */
function toggleDrawer({ state, burger, drawer, mobileDrawerQuery, force }) {
  const open = force ?? !state.get("open");
  state.set("open", open);
  document.body.classList.toggle("drawer-open", open);
  burger.setAttribute("aria-expanded", String(open));
  syncDrawerAccessibility({ state, drawer, mobileDrawerQuery });
}

/**
 * Keeps closed mobile drawer links out of keyboard traversal while preserving desktop nav.
 * @param root0 - Drawer accessibility context.
 * @param root0.state - Shared drawer state map.
 * @param root0.drawer - Drawer element to update.
 * @param root0.mobileDrawerQuery - Media query that distinguishes desktop nav from mobile drawer.
 */
function syncDrawerAccessibility({ state, drawer, mobileDrawerQuery }) {
  const hiddenMobileDrawer = mobileDrawerQuery.matches && !state.get("open");
  drawer.toggleAttribute("inert", hiddenMobileDrawer);
  drawer.setAttribute("aria-hidden", String(hiddenMobileDrawer));
}

/**
 * Closes the mobile drawer from keyboard dismissal without hijacking other keys.
 * @param root0 - Keyboard close context.
 * @param root0.event - Key event to inspect.
 * @param root0.state - Shared drawer state map.
 * @param root0.burger - Button whose expanded state should match the drawer.
 * @param root0.drawer - Drawer element whose focusability should match state.
 * @param root0.mobileDrawerQuery - Media query that distinguishes desktop nav from mobile drawer.
 */
function closeDrawerFromKeyboard({
  event,
  state,
  burger,
  drawer,
  mobileDrawerQuery,
}) {
  if (event.key === "Escape" && state.get("open"))
    toggleDrawer({ state, burger, drawer, mobileDrawerQuery, force: false });
}
