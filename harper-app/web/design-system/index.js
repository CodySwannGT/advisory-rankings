// AdvisorBook · Design System — barrel export
//
// Pages should import everything they need from here:
//
//   import {
//     mountThreeColumnPage, SectionCard, EmptyCard,
//     EntityRow, EntityChip, ProfileHead, FeedPostCard,
//     // …
//   } from './design-system/index.js';
//
// To extend the system, add the new component to atoms.js,
// molecules.js, or organisms.js (whichever fits its complexity)
// and re-export it from this file. See docs/design-system.md.

export { el, $, clear } from './dom.js';

export {
	Button, Avatar, Tag, Skeleton, EmptyText, Heading,
	TextInput, FormLabel, Icon,
} from './atoms.js';

export {
	EntityChip, PostHeader, EntityRow, KvList, SanctionPill,
	DealStrip, EventStat, NavRow, LabeledField, FirmArrow,
} from './molecules.js';

export {
	Card, SectionCard, EmptyCard, ChipRow, EntityList,
	ProfileHead, Navbar, SiteFooter,
	TransitionEventCard, DisclosureEventCard, ArticleListBlock,
	FeedPostCard, CareerTimeline, SnapshotTable, ScrollableTable,
	SkeletonCard, BrowseCard, RollupCard, DetailsCard,
} from './organisms.js';

export {
	mountThreeColumnPage, mountFullWidthPage, mountCenteredNarrowPage,
} from './templates.js';
