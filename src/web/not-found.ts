import { refreshMe, logout, search } from "./app.js";
import {
  SectionCard,
  el,
  mountThreeColumnPage,
} from "./design-system/index.js";

mountThreeColumnPage({
  refreshMe,
  logout,
  search,
  pageTitle: "Page not found",
  build({ center }): void {
    center.appendChild(
      SectionCard({
        title: "We couldn't find that page",
        body: [
          el(
            "p",
            { class: "empty-copy" },
            "The link may be stale, or the address may have been typed incorrectly."
          ),
          el(
            "p",
            { class: "empty-copy" },
            "Use search above to find an advisor, firm, or team, or return to the feed."
          ),
          el(
            "a",
            { href: "/", class: "ab-btn ab-btn--primary not-found-home-link" },
            "Go to Home"
          ),
        ],
      })
    );
  },
});
