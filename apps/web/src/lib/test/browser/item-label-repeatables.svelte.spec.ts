import { describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import { createBlockRegistry } from '$lib/blocks/registry';
import FormGenerator from '$lib/components/form/FormGenerator.svelte';

vi.mock('$lib/features/draft-assets/image-resolver', () => ({
	resolveClientAssetUrl: vi.fn(async (value: string | null | undefined) => value ?? null)
}));

describe('repeatable item label browser coverage', () => {
	it('updates visible repeatable labels after saving a panel draft', async () => {
		const screen = await render(FormGenerator, {
			config: {
				type: 'content',
				label: 'Page',
				content: {
					mode: 'file',
					path: 'src/content/page.json'
				},
				blocks: [
					{
						id: 'sections',
						type: 'block',
						label: 'Sections',
						collection: true,
						itemLabel: 'Section',
						blocks: [
							{ id: 'title', type: 'text', label: 'Title' },
							{ id: 'summary', type: 'text', label: 'Summary', isItemLabel: true }
						]
					}
				]
			},
			initialData: {
				sections: [{ title: 'Intro', summary: 'Opening' }]
			}
		});

		await expectElement(screen.getByRole('button', { name: 'Edit Section 1: Opening' }))
			.toBeVisible();
		await screen.getByRole('button', { name: 'Edit Section 1: Opening' }).click();
		await screen.getByLabelText('Summary').fill('Updated opening');
		await screen.getByRole('button', { name: 'Save' }).click();

		await expectElement(screen.getByRole('button', { name: 'Edit Section 1: Updated opening' }))
			.toBeVisible();
	});

	it('renders date-based repeatable labels with itemLabelFormat after create', async () => {
		const screen = await render(FormGenerator, {
			config: {
				type: 'content',
				label: 'Events',
				content: {
					mode: 'file',
					path: 'src/content/events.json'
				},
				blocks: [
					{
						id: 'events',
						type: 'block',
						label: 'Events',
						collection: true,
						itemLabel: 'Event',
						blocks: [
							{
								id: 'startsOn',
								type: 'date',
								label: 'Starts on',
								isItemLabel: true,
								itemLabelFormat: {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								}
							},
							{ id: 'title', type: 'text', label: 'Title' }
						]
					}
				]
			},
			initialData: {
				events: []
			}
		});

		await screen.getByRole('button', { name: 'Add Event' }).click();
		await screen.getByLabelText('Starts on').fill('2026-04-03');
		await screen.getByLabelText('Title').fill('Launch');
		await screen.getByRole('button', { name: 'Add', exact: true }).click();

		await expectElement(screen.getByRole('button', { name: 'Edit Event 1: Apr 3, 2026' }))
			.toBeVisible();
	});

	it('uses reusable block config label metadata for repeatable entries', async () => {
		const screen = await render(FormGenerator, {
			config: {
				type: 'content',
				label: 'Project',
				content: {
					mode: 'file',
					path: 'src/content/project.json'
				},
				blocks: [
					{
						id: 'images',
						type: 'galleryImage',
						label: 'Images',
						collection: true,
						itemLabel: 'Image'
					}
				]
			},
			initialData: {
				images: [{ title: 'Fallback title', alt: 'Opening view' }]
			},
			blockRegistry: createBlockRegistry([
				{
					id: 'galleryImage',
					path: 'tentman/blocks/gallery-image.tentman.json',
					config: {
						type: 'block',
						id: 'galleryImage',
						label: 'Gallery image',
						itemLabel: 'Image',
						collection: true,
						blocks: [
							{ id: 'title', type: 'text', label: 'Title' },
							{ id: 'alt', type: 'text', label: 'Alt text', isItemLabel: true }
						]
					}
				}
			] as never)
		});

		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.toBeVisible();
	});
});
