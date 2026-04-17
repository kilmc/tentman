import type { DiscoveredConfig } from '$lib/config/discovery';
import type { NavigationManifestState } from '$lib/features/content-management/navigation-manifest';

export interface ChangedPageSummary {
	slug: string;
	label: string;
	changeCount: number;
	isCollection: boolean;
}

export interface PagesOverviewSummary {
	draftBranch: string | null;
	changedPages: ChangedPageSummary[];
	totalChanges: number;
	hasConfigs: boolean;
}

export const EMPTY_PAGES_OVERVIEW_SUMMARY: PagesOverviewSummary = {
	draftBranch: null,
	changedPages: [],
	totalChanges: 0,
	hasConfigs: false
};

export function createEmptyPagesOverviewSummary(hasConfigs: boolean): PagesOverviewSummary {
	return {
		...EMPTY_PAGES_OVERVIEW_SUMMARY,
		hasConfigs
	};
}

export interface PagesOverviewSummaryRequest {
	configs: DiscoveredConfig[];
	navigationManifest: NavigationManifestState;
}

export function normalizePagesOverviewSummary(
	value: Partial<PagesOverviewSummary> | null | undefined
): PagesOverviewSummary {
	const changedPages = value?.changedPages ?? [];

	return {
		draftBranch: value?.draftBranch ?? null,
		changedPages,
		totalChanges:
			typeof value?.totalChanges === 'number'
				? value.totalChanges
				: changedPages.reduce((total, page) => total + page.changeCount, 0),
		hasConfigs: value?.hasConfigs ?? false
	};
}

export async function loadPagesOverviewSummary(
	fetcher: typeof fetch,
	request: PagesOverviewSummaryRequest
): Promise<PagesOverviewSummary> {
	const response = await fetcher('/api/repo/pages-summary', {
		method: 'POST',
		headers: {
			'content-type': 'application/json'
		},
		body: JSON.stringify(request)
	});

	if (!response.ok) {
		const error = new Error(
			`Failed to load pages overview summary (${response.status})`
		) as Error & {
			status?: number;
		};
		error.status = response.status;
		throw error;
	}

	return normalizePagesOverviewSummary((await response.json()) as Partial<PagesOverviewSummary>);
}
