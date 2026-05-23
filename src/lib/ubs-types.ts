import { FirmSourceRows } from "./firm-source-adapter.js";

/** Address object returned by the UBS Broadridge Presenter locator API. */
export interface UbsAddress {
  readonly Address1?: string | null;
  readonly Address2?: string | null;
  readonly AddressType?: string | null;
  readonly City?: string | null;
  readonly Country?: string | null;
  readonly PostalCode?: string | null;
  readonly Region?: string | null;
}

/** AdditionalData object returned by the UBS locator API. */
// eslint-disable-next-line functional/type-declaration-immutability -- External JSON DTO with nested optional fields.
export interface UbsAdditionalData {
  readonly Emails?: string | null;
  readonly EntityId?: string | null;
  readonly JobTitle?: string | null;
  readonly LinkedInUrl?: string | null;
  readonly LocalNumber?: string | null;
  readonly MarketingName?: string | null;
  readonly ParentEntityId?: string | null;
  readonly ParentMarketingName?: string | null;
  readonly ParentSiteUrl?: string | null;
  readonly RankTitle?: string | null;
  readonly SiteName?: string | null;
  readonly TeamSiteNames?: string | ReadonlyArray<string> | null;
  readonly TeamSiteUrls?: string | ReadonlyArray<string> | null;
  readonly UniqueId?: string | null;
}

/** Individual advisor entity returned by the UBS locator API. */
export interface UbsAdvisorEntity {
  readonly AdditionalData?: UbsAdditionalData | null;
  readonly Addresses?: ReadonlyArray<UbsAddress> | null;
  readonly Company?: string | null;
  readonly FirstName?: string | null;
  readonly LastName?: string | null;
  readonly ProfileId?: number | string | null;
  readonly ProfileType?: string | null;
  readonly UniqueId?: string | null;
}

/** Search envelope returned by the UBS locator API. */
// eslint-disable-next-line functional/type-declaration-immutability -- External JSON DTO with nested optional fields.
export interface UbsSearchResponse {
  readonly Entity?: ReadonlyArray<UbsAdvisorEntity> | null;
}

/** Harper row bundle produced by the UBS adapter. */
export class UbsRows extends FirmSourceRows {}
