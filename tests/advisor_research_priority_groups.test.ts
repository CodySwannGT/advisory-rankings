import { describe, expect, it } from "vitest";

import type { AdvisorResearchQueueItem } from "../src/harper/resource-advisor-research-items.js";
import {
  countStatuses,
  NEVER_CHECKED_STATUS,
  priorityGroups,
} from "../src/harper/resource-advisor-research-priority-groups.js";

const FILTERS = {
  sourceType: "web_research",
  staleDays: 45,
  limit: 25,
};
const AMBIGUOUS_STATUS = "ambiguous";
const BUSINESS_EMAIL_FIELD = "businessEmail";
const BIO_TEXT_FIELD = "bioText";
const NO_NEW_DATA_STATUS = "no_new_data";
const CONTACT_ADVISOR_ID = "advisor-contact";
const NEVER_CHECKED_ADVISOR_ID = "advisor-never";
const PROFILE_ADVISOR_ID = "advisor-profile";

describe("advisor research priority groups", () => {
  it("summarizes missing fields, stale checks, and never-checked rows", () => {
    const groups = priorityGroups(
      [
        queueItem(CONTACT_ADVISOR_ID, {
          missingFields: ["businessPhone", "linkedinUrl"],
          status: NO_NEW_DATA_STATUS,
        }),
        queueItem(PROFILE_ADVISOR_ID, {
          missingFields: [BIO_TEXT_FIELD, "headshotUrl"],
          status: AMBIGUOUS_STATUS,
        }),
        queueItem(NEVER_CHECKED_ADVISOR_ID, {
          missingFields: [BUSINESS_EMAIL_FIELD, BIO_TEXT_FIELD],
          status: null,
        }),
        queueItem("advisor-stale", {
          missingFields: [],
          status: NO_NEW_DATA_STATUS,
        }),
      ],
      FILTERS
    );

    expect(groups).toEqual([
      {
        id: "missing_contact_data",
        label: "Missing contact data",
        count: 2,
        filters: {
          ...FILTERS,
          status: null,
          missingField: BUSINESS_EMAIL_FIELD,
        },
        representativeAdvisorIds: [
          CONTACT_ADVISOR_ID,
          NEVER_CHECKED_ADVISOR_ID,
        ],
      },
      {
        id: "missing_profile_substance",
        label: "Missing profile substance",
        count: 2,
        filters: {
          ...FILTERS,
          status: null,
          missingField: BIO_TEXT_FIELD,
        },
        representativeAdvisorIds: [
          PROFILE_ADVISOR_ID,
          NEVER_CHECKED_ADVISOR_ID,
        ],
      },
      {
        id: "stale_checked_profiles",
        label: "Stale checked profiles",
        count: 3,
        filters: {
          ...FILTERS,
          status: NO_NEW_DATA_STATUS,
          missingField: null,
        },
        representativeAdvisorIds: [
          CONTACT_ADVISOR_ID,
          PROFILE_ADVISOR_ID,
          "advisor-stale",
        ],
      },
      {
        id: "never_checked_profiles",
        label: "Never-checked profiles",
        count: 1,
        filters: {
          ...FILTERS,
          status: NEVER_CHECKED_STATUS,
          missingField: null,
        },
        representativeAdvisorIds: [NEVER_CHECKED_ADVISOR_ID],
      },
    ]);
  });

  it("keeps empty and partial groups replayable", () => {
    const groups = priorityGroups(
      [
        queueItem("advisor-a", {
          missingFields: ["headshotUrl"],
          status: null,
        }),
      ],
      { sourceType: "firm_bio", staleDays: 7, limit: 10 }
    );

    expect(groups).toMatchObject([
      {
        id: "missing_contact_data",
        count: 0,
        filters: {
          sourceType: "firm_bio",
          staleDays: 7,
          status: null,
          missingField: null,
          limit: 10,
        },
        representativeAdvisorIds: [],
      },
      {
        id: "missing_profile_substance",
        count: 1,
        filters: {
          sourceType: "firm_bio",
          staleDays: 7,
          status: null,
          missingField: "headshotUrl",
          limit: 10,
        },
        representativeAdvisorIds: ["advisor-a"],
      },
      {
        id: "stale_checked_profiles",
        count: 0,
        filters: {
          sourceType: "firm_bio",
          staleDays: 7,
          status: null,
          missingField: null,
          limit: 10,
        },
        representativeAdvisorIds: [],
      },
      {
        id: "never_checked_profiles",
        count: 1,
        filters: {
          sourceType: "firm_bio",
          staleDays: 7,
          status: NEVER_CHECKED_STATUS,
          missingField: null,
          limit: 10,
        },
        representativeAdvisorIds: ["advisor-a"],
      },
    ]);
  });

  it("normalizes missing statuses into never-checked counts", () => {
    expect(
      countStatuses([
        queueItem("advisor-a", { missingFields: [], status: null }),
        queueItem("advisor-b", {
          missingFields: [],
          status: AMBIGUOUS_STATUS,
        }),
        queueItem("advisor-c", {
          missingFields: [],
          status: AMBIGUOUS_STATUS,
        }),
      ])
    ).toEqual({
      [NEVER_CHECKED_STATUS]: 1,
      [AMBIGUOUS_STATUS]: 2,
    });
  });
});

function queueItem(
  advisorId: string,
  values: Pick<AdvisorResearchQueueItem, "missingFields" | "status">
): AdvisorResearchQueueItem {
  return {
    advisorId,
    advisorName: advisorId,
    finraCrd: null,
    profileUrl: `/advisor.html?id=${advisorId}`,
    firm: null,
    sourceType: FILTERS.sourceType,
    status: values.status,
    lastCheckedAt: values.status ? "2026-05-01T00:00:00.000Z" : null,
    nextCheckAfter: values.status ? "2026-05-31T00:00:00.000Z" : null,
    daysSinceLastCheck: values.status ? 40 : null,
    missingFields: values.missingFields,
    provenance: {
      sourceTable: "AdvisorResearchCheck",
      sourceIds: values.status ? [`check-${advisorId}`] : [],
    },
  };
}
