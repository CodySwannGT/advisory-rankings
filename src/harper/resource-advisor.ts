// @ts-nocheck
import { cmpAsc, cmpDesc, dateMs } from "./resource-pagination.js";
import { advisorDisplayName } from "./resource-routing.js";
import {
  articleStub,
  disclosureRow,
  firmChip,
  teamChip,
  transitionRow,
} from "./resource-feed.js";

/**
 * Builds the advisor profile response from the loaded table snapshot.
 * @param db - Loaded resource index bundle.
 * @param advisor - Advisor row resolved from the route id.
 * @returns Advisor profile payload consumed by the web UI.
 */
export function advisorProfilePayload(db, advisor) {
  const advisorId = advisor.id;
  return {
    advisor,
    displayName: advisorDisplayName(advisor),
    career: advisorCareer(db, advisorId),
    teams: advisorTeams(db, advisorId),
    disclosures: advisorDisclosures(db, advisorId),
    outsideBusinessActivities: db.obas.filter(o => o.advisorId === advisorId),
    registrationApplications: advisorRegistrationApplications(db, advisorId),
    transitions: db.transitions
      .filter(t => t.subjectAdvisorId === advisorId)
      .map(t => transitionRow(t, db)),
    articles: advisorArticles(db, advisorId),
    ...advisorCredentials(db, advisorId),
    brokerCheckSnapshot: advisorBrokerCheckSnapshot(db, advisorId),
  };
}

/**
 * Builds an advisor's employment timeline.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against employment history.
 * @returns Career rows enriched with firm and branch display data.
 */
function advisorCareer(db, advisorId) {
  return db.employments
    .filter(employment => employment.advisorId === advisorId)
    .sort(cmpAsc("startDate"))
    .map(employment => {
      const firm = db.byFirm.get(employment.firmId);
      const branch = employment.branchId
        ? db.byBranch.get(employment.branchId)
        : null;
      return {
        firm: firmChip(firm),
        branch: branch && {
          id: branch.id,
          name: branch.name,
          level: branch.level,
          city: branch.city,
          state: branch.state,
        },
        roleTitle: employment.roleTitle,
        roleCategory: employment.roleCategory,
        startDate: employment.startDate,
        endDate: employment.endDate,
        reasonForLeaving: employment.reasonForLeaving,
        aumAtDeparture: employment.aumAtDeparture,
        productionT12AtDeparture: employment.productionT12AtDeparture,
        signingBonusPromissoryNote: employment.signingBonusPromissoryNote,
        u5Filed: employment.u5Filed,
        u5FilingDate: employment.u5FilingDate,
      };
    });
}

/**
 * Builds team membership rows for an advisor profile.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against team memberships.
 * @returns Team memberships enriched with team chips.
 */
function advisorTeams(db, advisorId) {
  return db.memberships
    .filter(membership => membership.advisorId === advisorId)
    .map(membership => ({
      team: teamChip(db.byTeam.get(membership.teamId), db),
      role: membership.role,
      startDate: membership.startDate,
      endDate: membership.endDate,
    }));
}

/**
 * Builds disclosure rows for an advisor profile.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against disclosures.
 * @returns Disclosure rows enriched with sanctions and clusters.
 */
function advisorDisclosures(db, advisorId) {
  return db.disclosures
    .filter(disclosure => disclosure.advisorId === advisorId)
    .sort(
      (x, y) =>
        dateMs(x.dateInitiated ?? x.dateResolved) -
        dateMs(y.dateInitiated ?? y.dateResolved)
    )
    .map(disclosure => disclosureRow(disclosure, db));
}

/**
 * Builds registration application rows with firm chips.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against registration applications.
 * @returns Registration applications for the advisor profile.
 */
function advisorRegistrationApplications(db, advisorId) {
  return db.regApps
    .filter(row => row.advisorId === advisorId)
    .map(row => ({
      ...row,
      firm: firmChip(db.byFirm.get(row.firmId)),
    }));
}

/**
 * Builds article coverage rows mentioning an advisor.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against article mentions.
 * @returns Compact article summaries in reverse publication order.
 */
function advisorArticles(db, advisorId) {
  const articleIds = new Set(
    db.mAdv
      .filter(mention => mention.advisorId === advisorId)
      .map(mention => mention.articleId)
  );
  return [...articleIds]
    .map(articleId => db.byArticle.get(articleId))
    .filter(Boolean)
    .sort(cmpDesc("publishedDate"))
    .map(articleStub);
}

/**
 * Builds license, designation, and education sections for an advisor.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID to match against credential rows.
 * @returns Credential row groups for the advisor profile.
 */
function advisorCredentials(db, advisorId) {
  return {
    licenses: (db.licenses || [])
      .filter(row => row.advisorId === advisorId)
      .sort(cmpAsc("grantedDate"))
      .map(licenseStub),
    designations: (db.designations || [])
      .filter(row => row.advisorId === advisorId)
      .sort(cmpAsc("earnedDate"))
      .map(designationStub),
    education: (db.education || [])
      .filter(row => row.advisorId === advisorId)
      .sort((x, y) => (x.graduationYear || 0) - (y.graduationYear || 0))
      .map(educationStub),
  };
}

/**
 * Builds the public BrokerCheck snapshot summary for an advisor.
 * @param db - Loaded resource index bundle.
 * @param advisorId - Advisor ID used by BrokerCheck snapshot rows.
 * @returns Snapshot summary or null when no snapshot is loaded.
 */
function advisorBrokerCheckSnapshot(db, advisorId) {
  const snapshot = db.bcSnapByAdvisor.get(advisorId) || null;
  return (
    snapshot && {
      fetchedAt: snapshot.fetchedAt,
      subjectCrd: snapshot.subjectCrd,
      bcScope: snapshot.bcScope,
      iaScope: snapshot.iaScope,
      disclosureCount: snapshot.disclosureCount,
      employmentCount: snapshot.employmentCount,
      examCount: snapshot.examCount,
    }
  );
}

/**
 * Trims a license row to the fields shown on advisor profiles.
 * @param row - License row from Harper.
 * @returns Public license summary.
 */
function licenseStub(row) {
  return {
    id: row.id,
    licenseType: row.licenseType,
    state: row.state,
    grantedDate: row.grantedDate,
    expiresDate: row.expiresDate,
    status: row.status,
  };
}

/**
 * Trims a designation row to the fields shown on advisor profiles.
 * @param row - Designation row from Harper.
 * @returns Public designation summary.
 */
function designationStub(row) {
  return {
    id: row.id,
    code: row.code,
    grantingBody: row.grantingBody,
    earnedDate: row.earnedDate,
    expiresDate: row.expiresDate,
    status: row.status,
  };
}

/**
 * Trims an education row to the fields shown on advisor profiles.
 * @param row - Education row from Harper.
 * @returns Public education summary.
 */
function educationStub(row) {
  return {
    id: row.id,
    institution: row.institution,
    degree: row.degree,
    field: row.field,
    graduationYear: row.graduationYear,
  };
}
