import type { AdvisorProfilePayload } from "../types/advisor-profile.js";

import { publicReadinessCard } from "./advisor-readiness-card.js";
import { identityCard } from "./advisor-sections.js";

export const appendAdvisorRightRail = (
  right: HTMLElement,
  d: AdvisorProfilePayload,
  desktopEvidenceRoot: HTMLElement
): void => {
  right.append(
    identityCard(d.advisor),
    desktopEvidenceRoot,
    publicReadinessCard(d)
  );
};
