import { describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import SidePanelHostHarness from '$lib/test/fixtures/SidePanelHostHarness.svelte';

const blockRegistry = {
	entries: [],
	get: () => undefined,
	has: () => false,
	getAdapter: () => undefined
};

describe('components/form/SidePanelHost.svelte', () => {
	it('applies editorLayout to object-panel editing surfaces', async () => {
		const screen = await render(SidePanelHostHarness, {
			width: 1100,
			panel: {
				id: 'object:meta',
				kind: 'object',
				mode: 'edit',
				label: 'Metadata',
				listLabel: 'Metadata',
				title: 'Metadata',
				blocks: [
					{ id: 'summary', type: 'textarea', label: 'Summary' },
					{ id: 'slug', type: 'text', label: 'Slug' }
				],
				editorLayout: {
					aside: ['slug'],
					asideLabel: 'Details'
				},
				selectedItem: {
					summary: 'A short summary',
					slug: 'hello-world'
				},
				targetPath: ['meta'],
				itemFieldPath: 'meta',
				blockRegistry,
				isDirty: false,
				hasParentPanel: false
			}
		});

		await vi.waitFor(() => {
			expect(document.querySelector('[data-layout-mode]')?.getAttribute('data-layout-mode')).toBe(
				'wide'
			);
		});

		await expectElement(screen.getByLabelText('Summary')).toBeVisible();
		await expectElement(screen.getByLabelText('Slug')).toBeVisible();
		await expectElement(screen.getByRole('button', { name: /Details/ })).toBeVisible();
	});
});
