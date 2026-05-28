// Firm profile page.
// All UI comes from the design system — see docs/design-system.md.
// This file is the thin orchestrator: it wires the route, loads the
// FirmProfile payload, and delegates rendering to focused modules
// under `./firm/`.

import type { RouteError } from "../harper/resource-profile-endpoints-types.js";
import {
  api,
  refreshMe,
  logout,
  search,
  getEntityIdParam,
  initials,
  canonicalizeEntityRoute,
} from "./app.js";
import { mountThreeColumnPage, clear } from "./design-system/index.js";
import {
  DetailNotFoundCard,
  renderDetailLoading,
  renderRecoverableDetailError,
} from "./detail-state.js";
import {
  EmptyCardComponent,
  FirmExtraFields,
  FirmProfilePayloadOrError,
  firmSubtitleAdapter,
  firmTagsAdapter,
  PageColumns,
  ProfileHeadComponent,
} from "./firm/shared.js";
import {
  appendSections,
  firmCenterSections,
  firmRightSections,
} from "./firm/sections.js";

mountThreeColumnPage({
  active: "firms",
  refreshMe,
  logout,
  search,
  build({ center, right }: PageColumns): void {
    const id = getEntityIdParam();
    if (!id) {
      center.appendChild(
        EmptyCardComponent({
          title: "No firm selected",
          body: "Open a firm from the feed.",
        })
      );
      return;
    }

    const loadFirmProfile = (): void => {
      clear(center);
      clear(right);
      renderDetailLoading({ center, right, label: "firm profile" });
      api<FirmProfilePayloadOrError>(`/FirmProfile/${encodeURIComponent(id)}`)
        .then(d => {
          clear(center);
          clear(right);
          render(d, center, right);
        })
        .catch((err: unknown) => {
          renderRecoverableDetailError({
            center,
            right,
            title: "Could not load firm",
            error: err,
            onRetry: loadFirmProfile,
          });
        });
    };

    loadFirmProfile();
  },
});

/**
 * Renders the firm profile into the page.
 * @param d - FirmProfile payload returned by the FirmProfile resource.
 * @param center - Main content column.
 * @param right - Right sidebar column.
 */
function render(
  d: FirmProfilePayloadOrError,
  center: HTMLElement,
  right: HTMLElement
): void {
  if (isErrorPayload(d)) {
    center.appendChild(
      DetailNotFoundCard({
        title: "Firm not found",
        id: d.id,
        actionLabel: "Back to Firms",
        href: "/firms",
      })
    );
    return;
  }
  const f = d.firm;
  const profile = ProfileHeadComponent({
    initialsText: initials(f.name),
    imageUrl: (f as unknown as FirmExtraFields).logoUrl,
    title: f.name,
    subtitle: firmSubtitleAdapter(f),
    tags: firmTagsAdapter(f),
  });

  canonicalizeEntityRoute("firm", f);
  center.appendChild(profile);
  appendSections(center, firmCenterSections(d));
  appendSections(right, firmRightSections(d));
}

/**
 * Discriminates a not-found error envelope from a firm profile payload.
 * @param payload - Resource response under inspection.
 * @returns Whether the payload represents a not-found envelope.
 */
function isErrorPayload(
  payload: FirmProfilePayloadOrError
): payload is RouteError {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    Boolean(payload.error)
  );
}
