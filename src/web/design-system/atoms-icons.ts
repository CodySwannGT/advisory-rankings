/** Named icons available through the design-system icon atom. */
export type IconName =
  | "home"
  | "building"
  | "branches"
  | "coverage"
  | "recruiting"
  | "rankings"
  | "advisor"
  | "teams"
  | "watchlist"
  | "compliance"
  | "research"
  | "discrepancies";

/**
 * Builds a small line icon for the named design-system set.
 * @param name - Icon identifier.
 * @returns SVG node.
 */
export function iconSvg(name: IconName): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  path.setAttribute("d", ICON_PATHS[name]);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-width", "2");
  svg.appendChild(path);
  return svg;
}

const ICON_PATHS: Readonly<Record<IconName, string>> = {
  advisor: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  branches: "M6 3v6m12-6v6M6 9h12M6 9v12m12-12v12M4 21h4m8 0h4",
  building:
    "M4 21V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v16M8 7h1m4 0h1M8 11h1m4 0h1M8 15h1m4 0h1M3 21h18",
  compliance: "M12 3v18m-6-12h12M6 9l-3 6h6L6 9Zm12 0l-3 6h6l-3-6Z",
  coverage: "M4 19V5m0 14h16M8 16V9m4 7V6m4 10v-4",
  discrepancies: "M12 9v4m0 4h.01M10 4h4l7 15H3L10 4Z",
  home: "M3 11l9-8 9 8M5 10v11h5v-6h4v6h5V10",
  rankings: "M5 20V10m7 10V4m7 16v-7M3 20h18",
  recruiting: "M7 7h10M7 17h10M17 7l-3-3m3 3-3 3M7 17l3-3m-3 3 3 3",
  research: "M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm4.5 10.5L21 21",
  teams:
    "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3 21a5 5 0 0 1 10 0m-2 0a5 5 0 0 1 10 0",
  watchlist:
    "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2 7.5 14 3 9.6l6.2-.9L12 3Z",
};
