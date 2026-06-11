import { api, logout, refreshMe, search } from "./app.js";
import {
  SectionCard,
  clear,
  mountThreeColumnPage,
} from "./design-system/index.js";
import type { AdvisorCorrectionRequestQueueResponse } from "../harper/resource-advisor-correction-queue.js";

import { renderInbox, renderInboxError } from "./correction-inbox-view.js";

mountThreeColumnPage({
  active: "corrections",
  refreshMe,
  logout,
  search,
  pageTitle: "Correction request inbox",
  build({ center, right }) {
    loadInbox(center, right);
  },
});

/**
 * Loads the analyst correction queue and renders its current state.
 * @param center Main page column.
 * @param right Right rail column.
 */
function loadInbox(center: HTMLElement, right: HTMLElement): void {
  const actions = {
    reload: () => loadInbox(center, right),
  };
  clear(center);
  clear(right);
  center.appendChild(
    SectionCard({
      title: "Loading correction requests",
      body: "Fetching pending advisor-submitted corrections.",
    })
  );
  api<AdvisorCorrectionRequestQueueResponse>("/AdvisorCorrectionRequest")
    .then(payload => renderInbox(payload, center, right, actions))
    .catch((error: unknown) => renderInboxError(error, center, right, actions));
}
