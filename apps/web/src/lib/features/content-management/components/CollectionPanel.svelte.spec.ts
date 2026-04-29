import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import CollectionPanel from './CollectionPanel.svelte';

vi.mock('$app/paths', () => ({
	resolve: (path: string) => path
}));

describe('CollectionPanel customize mode', () => {
	it('keeps the current panel structure editable and saves the draft order payload', async () => {
		const onsavecustomorder = vi.fn();
		const screen = render(CollectionPanel, {
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
			onsavecustomorder
		});

		await expect.element(screen.getByRole('button', { name: 'Customize order' })).toBeVisible();
		await screen.getByRole('button', { name: 'Customize order' }).click();
		await expect.element(screen.getByRole('button', { name: 'Save order' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Drag Identity' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Drag Brand system' })).toBeVisible();

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
		const screen = render(CollectionPanel, {
			slug: 'projects',
			label: 'Projects',
			itemLabel: 'Project',
			canOrderItems: true,
			items: [{ itemId: 'archive', title: 'Archive', sortDate: null }],
			groups: [],
			onsavecustomorder
		});

		await screen.getByRole('button', { name: 'Customize order' }).click();
		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(screen.getByRole('link', { name: 'Archive' })).toBeVisible();
		expect(onsavecustomorder).not.toHaveBeenCalled();
	});

	it('collapses grouped items while a group drag starts', async () => {
		const screen = render(CollectionPanel, {
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
			]
		});

		await screen.getByRole('button', { name: 'Customize order' }).click();
		await expect.element(screen.getByRole('button', { name: 'Drag Brand system' })).toBeVisible();

		screen
			.getByRole('button', { name: 'Drag Identity' })
			.element()
			.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
		await new Promise((resolve) => requestAnimationFrame(resolve));

		await expect.element(screen.getByRole('button', { name: 'Drag Identity' })).toBeVisible();
		expect(document.body.textContent).not.toContain('Brand system');
	});
});
