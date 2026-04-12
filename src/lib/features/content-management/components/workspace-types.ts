import type { NavigationDraftCollection } from '$lib/features/content-management/navigation-draft';

export type WorkspaceNavItem = {
	id: string;
	slug: string;
	label: string;
	isCollection: boolean;
	isDndShadowItem?: boolean;
	[key: string]: unknown;
};

export type CollectionSortType = 'custom' | 'title' | 'date';

export type CollectionIndexItem = {
	id: string;
	title: string;
	isDndShadowItem?: boolean;
	[key: string]: unknown;
};

export type CollectionOrderDraft = NavigationDraftCollection;
