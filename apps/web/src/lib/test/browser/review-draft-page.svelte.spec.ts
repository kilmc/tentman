import { describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';

vi.mock('$app/forms', () => ({
	enhance: () => {
		return () => {};
	}
}));

vi.mock('../../../routes/publish/form-behavior', () => ({
	createPublishEnhanceHandler: vi.fn(() => () => {}),
	createDiscardEnhanceHandler: vi.fn(() => () => {})
}));

vi.mock('$lib/stores/draft-branch', () => ({
	draftBranch: {
		subscribe(callback: (value: { branchName: string | null }) => void) {
			callback({ branchName: 'tentman-preview' });
			return () => {};
		},
		setBranch: vi.fn(),
		hasDraft: vi.fn(() => true),
		clear: vi.fn()
	}
}));

import PublishReviewPage from '../../../routes/publish/+page.svelte';

const baseData = {
	rootConfig: {
		siteName: 'Tentman Docs'
	},
	selectedRepo: {
		owner: 'acme',
		name: 'docs',
		full_name: 'acme/docs',
		default_branch: 'main'
	},
	draftBranch: {
		name: 'tentman-preview'
	},
	reviewModel: {
		topLevelOrderChange: null,
		sections: [
			{
				configSlug: 'about',
				configLabel: 'About',
				isCollection: false,
				badges: [{ label: 'Edited', tone: 'neutral' }],
				defaultExpanded: true,
				navigationHref: '/pages/about/edit',
				collectionOrderChange: null,
				items: [
					{
						itemId: '_singleton',
						title: 'About page',
						href: '/pages/about/edit',
						changeKinds: ['edited'],
						defaultExpanded: true,
						fields: [
							{
								fieldId: 'title',
								label: 'Title',
								defaultExpanded: true,
								presentation: {
									kind: 'text',
									before: 'About',
									after: 'About us',
									diffMode: 'inline',
									beforeSegments: [{ value: 'About', status: 'removed' as const }],
									afterSegments: [{ value: 'About us', status: 'added' as const }],
									isLong: false
								}
							}
						]
					}
				]
			},
			{
				configSlug: 'posts',
				configLabel: 'Posts',
				isCollection: true,
				badges: [{ label: 'Moved', tone: 'accent' }],
				defaultExpanded: false,
				navigationHref: '/pages/posts',
				collectionOrderChange: null,
				items: [
					{
						itemId: 'hello-world',
						title: 'Hello world',
						href: '/pages/posts/hello-world',
						changeKinds: ['moved'],
						defaultExpanded: false,
						beforePosition: 1,
						afterPosition: 2,
						fields: []
					}
				]
			}
		],
		otherSiteChanges: {
			title: 'Other site changes',
			href: '/pages',
			files: [{ path: 'tentman.json', status: 'modified' as const }],
			defaultExpanded: false
		},
		hasHiddenUnreviewedChanges: false,
		reviewStatus: {
			mode: 'scoped' as const,
			source: 'changed-documents' as const,
			message: 'Tentman reviewed only the changed documents from this draft.',
			changedFileCount: 2,
			degradedChanges: []
		}
	}
};

describe('review draft publish page', () => {
	it('keeps sections independently collapsible and supports expand all / collapse all', async () => {
		const screen = await render(PublishReviewPage, {
			data: baseData as never
		});

		await expectElement(screen.getByText('About page')).toBeVisible();
		expect(screen.container.textContent).not.toContain(
			'This change only affects placement in the final order.'
		);

		await screen.getByRole('button', { name: 'Expand Posts' }).click();
		await screen.getByRole('button', { name: 'Expand Hello world' }).click();
		await expectElement(
			screen.getByText('This change only affects placement in the final order.')
		).toBeVisible();
		await expectElement(screen.getByText('About page')).toBeVisible();

		await screen.getByRole('button', { name: 'Collapse all' }).click();
		expect(screen.container.textContent).not.toContain('About page');

		await screen.getByRole('button', { name: 'Expand all' }).click();
		await expectElement(screen.getByText('About page')).toBeVisible();
		await expectElement(
			screen.getByText('This change only affects placement in the final order.')
		).toBeVisible();
	});

	it('keeps other site changes collapsed by default and leaves publish available', async () => {
		const screen = await render(PublishReviewPage, {
			data: baseData as never
		});

		expect(screen.container.textContent).not.toContain('tentman.json');
		await expectElement(screen.getByRole('button', { name: 'Publish Draft' })).toBeVisible();

		await screen.getByRole('button', { name: 'Expand Other site changes' }).click();
		await expectElement(screen.getByText('tentman.json')).toBeVisible();
	});

	it('shows partial scoped review status when broad review is degraded', async () => {
		const screen = await render(PublishReviewPage, {
			data: {
				...baseData,
				reviewModel: {
					...baseData.reviewModel,
					reviewStatus: {
						mode: 'degraded' as const,
						source: 'unsupported-scope' as const,
						message:
							'Tentman used the scoped compare result and skipped collection-wide document comparison for changes that need a narrower review path.',
						changedFileCount: 3,
						degradedChanges: [
							{
								slug: 'posts',
								label: 'Posts',
								reason:
									'Posts needs collection-wide comparison, which is unsupported on the scoped publish-summary path.'
							}
						]
					}
				}
			} as never
		});

		await expectElement(screen.getByText('Scoped review is partial')).toBeVisible();
		await expectElement(
			screen.getByText(/skipped collection-wide document comparison/)
		).toBeVisible();
		await expectElement(screen.getByText(/Posts needs collection-wide comparison/)).toBeVisible();
	});

	it('shows a blocked review warning and hides publish actions', async () => {
		const screen = await render(PublishReviewPage, {
			data: {
				...baseData,
				reviewModel: null,
				blockedReview: {
					title: 'Review Draft blocked',
					message:
						'This draft could trigger an unusually large number of repository reads. Tentman stopped before loading the review. Contact Kilian before continuing.',
					changedFileCount: 81,
					estimatedReviewDocumentReads: 42,
					limits: {
						maxChangedFiles: 80,
						maxReviewDocumentReads: 40
					},
					reasons: ['The draft contains 81 changed files.']
				}
			} as never
		});

		await expectElement(screen.getByText('Review Draft blocked')).toBeVisible();
		await expectElement(screen.getByText(/Contact Kilian before continuing/)).toBeVisible();
		expect(screen.container.textContent).not.toContain('Publish Draft');
	});
});
