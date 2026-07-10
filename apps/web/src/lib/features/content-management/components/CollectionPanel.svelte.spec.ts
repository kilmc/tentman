import { describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import CollectionPanel from './CollectionPanel.svelte';
import type { ResolvedCollectionSortCapabilities } from '$lib/features/content-management/collection-sorts';

vi.mock('$app/paths', () => ({
	resolve: (path: string) => path
}));

const titleSortCapabilities: ResolvedCollectionSortCapabilities = {
	sorts: [{ id: 'title', type: 'title', label: 'Alphabetical', defaultDirection: 'asc' }],
	defaultSortId: 'title',
	defaultDirection: 'asc',
	ordering: false
};

const dateSortCapabilities: ResolvedCollectionSortCapabilities = {
	sorts: [{ id: 'published', type: 'date', label: 'Published', defaultDirection: 'desc' }],
	defaultSortId: 'published',
	defaultDirection: 'desc',
	ordering: false
};

const filenameSortCapabilities: ResolvedCollectionSortCapabilities = {
	sorts: [{ id: 'filename', type: 'filename', label: 'Filename', defaultDirection: 'asc' }],
	defaultSortId: null,
	ordering: false
};

const customSortCapabilities: ResolvedCollectionSortCapabilities = {
	sorts: [
		{ id: 'manual', type: 'manual', label: 'Custom' },
		{ id: 'title', type: 'title', label: 'Alphabetical', defaultDirection: 'asc' }
	],
	defaultSortId: 'manual',
	ordering: true
};

describe('CollectionPanel customize mode', () => {
	it('shows the single available sort control without a dropdown when no default sort is configured', async () => {
		const screen = await render(CollectionPanel, {
			slug: 'posts',
			label: 'Posts',
			itemLabel: 'Post',
			items: [
				{ itemId: 'zulu', title: 'Zulu', sortDate: null },
				{ itemId: 'alpha', title: 'Alpha', sortDate: null }
			],
			groups: [],
			sortCapabilities: {
				sorts: [{ id: 'title', type: 'title', label: 'Alphabetical', defaultDirection: 'asc' }],
				defaultSortId: null,
				ordering: false
			}
		});

		await expectElement(screen.getByRole('button', { name: 'Sort Z-A' })).toBeEnabled();
		expect(document.querySelector('summary')).toBeNull();
		expect(document.body.textContent).not.toContain('Source');
		expect(document.body.textContent).not.toContain('Source order');

		const itemLinks = Array.from(
			document.querySelectorAll('a[href^="/pages/posts/"] .truncate.font-medium')
		).map((node) => node.textContent?.trim());

		expect(itemLinks).toEqual(['Alpha', 'Zulu']);
	});

	it('treats filename fallback sorting as an alphabetical A-Z control', async () => {
		const screen = await render(CollectionPanel, {
			slug: 'notes',
			label: 'Notes',
			itemLabel: 'Note',
			items: [
				{
					itemId: 'zulu',
					title: 'zulu',
					sortDate: null,
					sortValues: { filename: 'zulu.md' },
					hydration: 'fallback'
				},
				{
					itemId: 'alpha',
					title: 'alpha',
					sortDate: null,
					sortValues: { filename: 'alpha.md' },
					hydration: 'fallback'
				}
			],
			groups: [],
			sortCapabilities: filenameSortCapabilities
		});

		await expectElement(screen.getByRole('button', { name: 'Sort Z-A' })).toBeEnabled();
		let itemLinks = Array.from(
			document.querySelectorAll('a[href^="/pages/notes/"] .truncate.font-medium')
		).map((node) => node.textContent?.trim());

		expect(itemLinks).toEqual(['alpha', 'zulu']);

		await screen.getByRole('button', { name: 'Sort Z-A' }).click();
		itemLinks = Array.from(
			document.querySelectorAll('a[href^="/pages/notes/"] .truncate.font-medium')
		).map((node) => node.textContent?.trim());

		expect(itemLinks).toEqual(['zulu', 'alpha']);
	});

	it('sorts by the resolved title values shown in the panel', async () => {
		const screen = await render(CollectionPanel, {
			slug: 'projects',
			label: 'Projects',
			itemLabel: 'Project',
			items: [
				{ itemId: 'c', title: 'Zulu', sortDate: null },
				{ itemId: 'a', title: 'Alpha', sortDate: null },
				{ itemId: 'm', title: 'Middle', sortDate: null }
			],
			groups: [],
			sortCapabilities: {
				sorts: [
					{ id: 'manual', type: 'manual', label: 'Custom' },
					{ id: 'title', type: 'title', label: 'Alphabetical', defaultDirection: 'asc' }
				],
				defaultSortId: 'manual',
				ordering: true
			},
			canOrderItems: true
		});

		document.querySelector('summary')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await screen.getByRole('button', { name: 'Alphabetical' }).click();

		const itemLinks = Array.from(
			document.querySelectorAll('a[href^="/pages/projects/"] .truncate.font-medium')
		).map((node) => node.textContent?.trim());

		expect(itemLinks).toEqual(['Alpha', 'Middle', 'Zulu']);
	});

	it('shows visible date-style labels exactly as provided by shared resolution', async () => {
		const screen = await render(CollectionPanel, {
			slug: 'events',
			label: 'Events',
			itemLabel: 'Event',
			items: [
				{ itemId: 'event-1', title: 'Apr 3, 2026', sortDate: new Date('2026-04-03').getTime() }
			],
			groups: [],
			sortCapabilities: titleSortCapabilities
		});

		await expectElement(screen.getByRole('link', { name: 'Apr 3, 2026' })).toBeVisible();
	});

	it('filters collection items when search is enabled', async () => {
		const screen = await render(CollectionPanel, {
			slug: 'posts',
			label: 'Posts',
			itemLabel: 'Post',
			searchEnabled: true,
			items: [
				{ itemId: 'launch-notes', title: 'Launch notes', sortDate: null },
				{ itemId: 'release-plan', title: 'Release plan', sortDate: null }
			],
			groups: [
				{
					id: 'archive',
					label: 'Archive',
					items: [{ itemId: 'old-draft', title: 'Old draft', sortDate: null }]
				}
			],
			sortCapabilities: titleSortCapabilities
		});

		await expectElement(screen.getByLabelText('Search Posts')).toBeVisible();
		await screen.getByLabelText('Search Posts').fill('release');

		await expectElement(screen.getByRole('link', { name: 'Release plan' })).toBeVisible();
		expect(document.body.textContent).not.toContain('Launch notes');
		expect(document.body.textContent).not.toContain('Old draft');

		await screen.getByLabelText('Search Posts').fill('missing');
		await expectElement(screen.getByText('No items match your search.')).toBeVisible();
	});

	it('does not render Date when no date sort capability exists', async () => {
		await render(CollectionPanel, {
			slug: 'posts',
			label: 'Posts',
			itemLabel: 'Post',
			items: [{ itemId: 'post-1', title: 'Post 1', sortDate: new Date('2026-04-03').getTime() }],
			groups: [],
			sortCapabilities: titleSortCapabilities
		});

		expect(document.body.textContent).not.toContain('Date');
	});

	it('does not render Custom when ordering is not enabled', async () => {
		await render(CollectionPanel, {
			slug: 'posts',
			label: 'Posts',
			itemLabel: 'Post',
			items: [{ itemId: 'post-1', title: 'Post 1', sortDate: null }],
			groups: [],
			sortCapabilities: {
				sorts: [
					{ id: 'title', type: 'title', label: 'Alphabetical', defaultDirection: 'asc' },
					{ id: 'published', type: 'date', label: 'Published', defaultDirection: 'desc' }
				],
				defaultSortId: 'title',
				defaultDirection: 'asc',
				ordering: false
			}
		});

		expect(document.body.textContent).not.toContain('Custom');
	});

	it('requests sort hydration when the active sort has fallback items', async () => {
		const onrequestsorthydration = vi.fn();

		const screen = await render(CollectionPanel, {
			slug: 'posts',
			label: 'Posts',
			itemLabel: 'Post',
			items: [
				{
					itemId: 'first',
					title: 'first',
					sortDate: null,
					sortValues: {},
					hydration: 'fallback'
				},
				{
					itemId: 'second',
					title: 'second',
					sortDate: null,
					sortValues: {},
					hydration: 'fallback'
				}
			],
			groups: [],
			sortCapabilities: dateSortCapabilities,
			onrequestsorthydration
		});

		await expect.poll(() => onrequestsorthydration.mock.calls.length).toBe(1);
		await expectElement(screen.getByText('Loading items...')).toBeVisible();
		expect(document.body.textContent).not.toContain('first');
		expect(document.body.textContent).not.toContain('second');
	});

	it('does not request sort hydration when hydrated items have explicit empty sort values', async () => {
		const onrequestsorthydration = vi.fn();

		await render(CollectionPanel, {
			slug: 'posts',
			label: 'Posts',
			itemLabel: 'Post',
			items: [
				{
					itemId: 'first',
					title: 'First',
					sortDate: null,
					sortValues: { published: null },
					hydration: 'hydrated'
				}
			],
			groups: [],
			sortCapabilities: dateSortCapabilities,
			onrequestsorthydration
		});

		await new Promise((resolve) => requestAnimationFrame(resolve));
		expect(onrequestsorthydration).not.toHaveBeenCalled();
	});

	it('keeps the current panel structure editable and saves the draft order payload', async () => {
		const onsavecustomorder = vi.fn();
		const screen = await render(CollectionPanel, {
			slug: 'projects',
			label: 'Projects',
			itemLabel: 'Project',
			canOrderItems: true,
			items: [{ itemId: 'archive', title: 'Archive', sortDate: null }],
			groups: [
				{
					id: 'identity',
					label: 'Identity',
					items: [{ itemId: 'brand-system', title: 'Brand system', sortDate: null }]
				},
				{
					id: 'campaigns',
					label: 'Campaigns',
					items: [{ itemId: 'launch', title: 'Launch', sortDate: null }]
				}
			],
			sortCapabilities: customSortCapabilities,
			onsavecustomorder
		});

		await expectElement(screen.getByRole('button', { name: 'Customize order' })).toBeVisible();
		await screen.getByRole('button', { name: 'Customize order' }).click();
		await expectElement(screen.getByRole('button', { name: 'Save order' })).toBeVisible();
		await expectElement(screen.getByRole('button', { name: 'Drag Identity' })).toBeVisible();
		await expectElement(screen.getByRole('button', { name: 'Drag Brand system' })).toBeVisible();

		await screen.getByRole('button', { name: 'Save order' }).click();

		expect(onsavecustomorder).toHaveBeenCalledWith({
			ungroupedItems: ['archive'],
			groups: [
				{ id: 'identity', label: 'Identity', items: ['brand-system'] },
				{ id: 'campaigns', label: 'Campaigns', items: ['launch'] }
			]
		});
	});

	it('cancels unsaved customize changes', async () => {
		const onsavecustomorder = vi.fn();
		const screen = await render(CollectionPanel, {
			slug: 'projects',
			label: 'Projects',
			itemLabel: 'Project',
			canOrderItems: true,
			items: [{ itemId: 'archive', title: 'Archive', sortDate: null }],
			groups: [],
			sortCapabilities: customSortCapabilities,
			onsavecustomorder
		});

		await screen.getByRole('button', { name: 'Customize order' }).click();
		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expectElement(screen.getByRole('link', { name: 'Archive' })).toBeVisible();
		expect(onsavecustomorder).not.toHaveBeenCalled();
	});

	it('collapses grouped items while a group drag starts', async () => {
		const screen = await render(CollectionPanel, {
			slug: 'projects',
			label: 'Projects',
			itemLabel: 'Project',
			canOrderItems: true,
			items: [],
			groups: [
				{
					id: 'identity',
					label: 'Identity',
					items: [{ itemId: 'brand-system', title: 'Brand system', sortDate: null }]
				}
			],
			sortCapabilities: customSortCapabilities
		});

		await screen.getByRole('button', { name: 'Customize order' }).click();
		await expectElement(screen.getByRole('button', { name: 'Drag Brand system' })).toBeVisible();

		screen
			.getByRole('button', { name: 'Drag Identity' })
			.element()
			.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await new Promise((resolve) => requestAnimationFrame(resolve));

		await expectElement(screen.getByRole('button', { name: 'Drag Identity' })).toBeVisible();
		expect(document.body.textContent).not.toContain('Brand system');
	});

	it('collapses and expands grouped items in the panel view', async () => {
		const screen = await render(CollectionPanel, {
			slug: 'projects',
			label: 'Projects',
			itemLabel: 'Project',
			items: [],
			groups: [
				{
					id: 'identity',
					label: 'Identity',
					items: [{ itemId: 'brand-system', title: 'Brand system', sortDate: null }]
				}
			],
			sortCapabilities: customSortCapabilities,
			canOrderItems: true
		});

		await expectElement(screen.getByRole('link', { name: 'Brand system' })).toBeVisible();

		const toggle = screen.getByRole('button', { name: 'Collapse Identity' });
		expect(toggle.element().parentElement?.className).toContain('sticky');
		await toggle.click();

		expect(document.body.textContent).not.toContain('Brand system');
		await expectElement(screen.getByRole('button', { name: 'Expand Identity' })).toBeVisible();

		await screen.getByRole('button', { name: 'Expand Identity' }).click();
		await expectElement(screen.getByRole('link', { name: 'Brand system' })).toBeVisible();
	});
});
