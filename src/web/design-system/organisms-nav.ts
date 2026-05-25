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
  const meSpot = createMeSpot();
  const links = createLinks(active);
  const burger = createBurger(() => toggleDrawer(drawerState, burger));
  const drawer = el("div", { class: "nav-drawer" }, links, meSpot);
  const scrim = el("div", {
    class: "nav-scrim",
    onClick: () => toggleDrawer(drawerState, burger, false),
  });

  links.addEventListener("click", event => {
    if (event.target.tagName === "A" || event.target.closest("a"))
      toggleDrawer(drawerState, burger, false);
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
 * Opens or closes the mobile drawer and mirrors state to ARIA.
 * @param state - Shared drawer state map.
 * @param burger - Button whose expanded state should match the drawer.
 * @param force - Optional explicit drawer state.
 */
function toggleDrawer(state, burger, force) {
  const open = force ?? !state.get("open");
  state.set("open", open);
  document.body.classList.toggle("drawer-open", open);
  burger.setAttribute("aria-expanded", String(open));
}
