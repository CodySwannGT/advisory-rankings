import type { MorganStanleyYextLocation } from "./morgan-stanley-types.js";

/**
 * Address shape embedded in Morgan Stanley Yext rows. Each field is optional
 * because the upstream payload is loosely typed.
 */
export interface MorganStanleyAddressView {
  readonly line1?: string;
  readonly line2?: string;
  readonly city?: string;
  readonly region?: string;
  readonly countryCode?: string;
  readonly postalCode?: string;
}

/**
 * Thumbnail entry attached to a {@link MorganStanleyImageView}.
 */
export interface MorganStanleyImageThumbnailView {
  readonly url?: string;
}

/**
 * Image entry returned inside Morgan Stanley Yext profile photo blocks.
 */
export interface MorganStanleyImageView {
  readonly url?: string;
  readonly thumbnails?: ReadonlyArray<MorganStanleyImageThumbnailView>;
}

/**
 * Profile photo wrapper used on Morgan Stanley advisor rows.
 */
export interface MorganStanleyProfilePhotoView {
  readonly image?: MorganStanleyImageView;
}

/**
 * Branch-associated entity row embedded on Morgan Stanley advisor rows.
 */
export interface MorganStanleyBranchAssociatedEntityView {
  readonly c_branchName?: string;
}

/**
 * Team-linked entity row embedded on Morgan Stanley advisor rows.
 */
export interface MorganStanleyTeamLinkedEntityView {
  readonly c_pagesName?: string;
  readonly address?: MorganStanleyAddressView;
}

/**
 * Strongly typed view of the fields the row mapper reads from a Morgan
 * Stanley Yext location. The producer type is intentionally `unknown`-shaped;
 * this view is the single narrowing boundary used by consumers.
 */
export interface MorganStanleyLocationView {
  readonly id?: string;
  readonly uid?: string;
  readonly name?: string;
  readonly mainPhone?: string;
  readonly emails?: ReadonlyArray<string>;
  readonly address?: MorganStanleyAddressView;
  readonly c_profileType?: string;
  readonly c_pagesName?: string;
  readonly c_pagesURL?: string;
  readonly c_locatorURL?: string;
  readonly c_linkedInURL?: string;
  readonly c_primaryTitle?: string;
  readonly c_secondaryTitles?: ReadonlyArray<string>;
  readonly c_extLocatorFocusAreas?: ReadonlyArray<string>;
  readonly c_extLocatorLanguages?: ReadonlyArray<string>;
  readonly c_listOfCertifications?: ReadonlyArray<string>;
  readonly c_branchID?: string;
  readonly c_branchName?: string;
  readonly c_officeNumber?: string;
  readonly c_teamEntityName?: string;
  readonly c_profilePhotoSquare?: MorganStanleyProfilePhotoView;
  readonly c_branchAssociatedEntities?: ReadonlyArray<MorganStanleyBranchAssociatedEntityView>;
  readonly c_faTeamLinkedEntities?: ReadonlyArray<MorganStanleyTeamLinkedEntityView>;
}

/**
 * Single narrowing boundary from the loosely-typed producer payload to the
 * typed view consumed throughout the Morgan Stanley row mapper.
 * @param location - Producer-shaped Morgan Stanley Yext location.
 * @returns The same value typed as a {@link MorganStanleyLocationView}.
 */
export const morganStanleyLocationView = (
  location: MorganStanleyYextLocation
): MorganStanleyLocationView => location as MorganStanleyLocationView;
