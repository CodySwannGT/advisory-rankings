import {
  coverageTimelineModule,
  dataConfidenceModule,
  rankingPresenceModule,
  rankingRows,
  recruitingMomentumModule,
  regulatorySnapshotModule,
  rosterFootprintModule,
} from "./resource-firm-due-diligence-helpers.js";
import type {
  DueDiligenceModules,
  FirmDueDiligenceDb,
  FirmDueDiligencePayload,
  FirmDueDiligenceProfile,
} from "./resource-firm-due-diligence-types.js";

export type {
  FirmArticleStubView,
  FirmBrokerCheckSnapshotSlice,
  FirmDueDiligenceDb,
  FirmDueDiligencePayload,
  FirmDueDiligenceProfile,
  FirmTransitionRowView,
} from "./resource-firm-due-diligence-types.js";

/**
 * Builds due-diligence modules for a canonical public firm profile.
 * @param db - Loaded resource index bundle.
 * @param firmId - Canonical firm ID requested by the route.
 * @param profile - Existing firm profile rows already resolved for callers.
 * @returns Structured due-diligence modules with source and availability notes.
 */
export function firmDueDiligenceModules(
  db: FirmDueDiligenceDb,
  firmId: string,
  profile: FirmDueDiligenceProfile
): FirmDueDiligencePayload {
  const rankings = rankingRows(db, firmId);
  const modules: DueDiligenceModules = {
    recruitingMomentum: recruitingMomentumModule(
      firmId,
      profile.transitionsIn,
      profile.transitionsOut
    ),
    rosterFootprint: rosterFootprintModule(profile),
    rankingPresence: rankingPresenceModule(db, rankings),
    regulatorySnapshot: regulatorySnapshotModule(profile.brokerCheckSnapshot),
    coverageTimeline: coverageTimelineModule(profile.articles),
  };
  return {
    generatedAt: new Date().toISOString(),
    firmId,
    modules,
    dataConfidence: dataConfidenceModule(modules),
  };
}
