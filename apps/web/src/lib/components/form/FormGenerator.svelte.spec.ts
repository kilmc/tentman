import { describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import FormGeneratorSubmitHarness from '$lib/test/fixtures/FormGeneratorSubmitHarness.svelte';

const blockRegistry = {
	entries: [],
	get: () => undefined,
	has: () => false,
	getAdapter: () => undefined
};

const config = {
	type: 'content' as const,
	label: 'Post',
	content: {
		mode: 'file' as const,
		path: './post.json'
	},
	editorLayout: {
		aside: ['slug', 'published'],
		asideLabel: 'Metadata'
	},
	blocks: [
		{ id: 'title', type: 'text', label: 'Title', required: true },
		{ id: 'slug', type: 'text', label: 'Slug' },
		{ id: 'published', type: 'toggle', label: 'Published' }
	]
};

const dateConfig = {
	...config,
	blocks: [
		...config.blocks,
		{ id: 'published_at', type: 'date' as const, label: 'Published at' }
	]
};

describe('components/form/FormGenerator.svelte', () => {
	it('marks the form dirty and submits changed text field values', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config,
			blockRegistry,
			initialData: {
				title: 'Original title'
			},
			width: 640
		});

		const titleInput = screen.getByLabelText('Title');
		await titleInput.fill('Updated title');

		await expectElement(screen.getByTestId('form-dirty-state')).toHaveTextContent('dirty');

		await screen.getByRole('button', { name: 'Prepare submit' }).click();
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent('Updated title');
	});

	it('renders the aside as a collapsed stacked section in narrow containers', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config,
			blockRegistry,
			width: 640
		});

		await vi.waitFor(() => {
			expect(document.querySelector('[data-layout-mode]')?.getAttribute('data-layout-mode')).toBe(
				'stacked'
			);
			expect(document.querySelector('[data-aside-open]')?.getAttribute('data-aside-open')).toBe(
				'false'
			);
		});

		await expectElement(screen.getByLabelText('Title')).toBeVisible();
		await expectElement(screen.getByLabelText('Slug')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: /Metadata/ }).click();

		await expectElement(screen.getByLabelText('Slug')).toBeVisible();
		await expectElement(screen.getByLabelText('Published')).toBeVisible();
	});

	it('renders the aside open in a side column for wide containers', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config,
			blockRegistry,
			width: 1100
		});

		await vi.waitFor(() => {
			expect(document.querySelector('[data-layout-mode]')?.getAttribute('data-layout-mode')).toBe(
				'wide'
			);
			expect(document.querySelector('[data-aside-open]')?.getAttribute('data-aside-open')).toBe(
				'true'
			);
		});

		await expectElement(screen.getByLabelText('Title')).toBeVisible();
		await expectElement(screen.getByLabelText('Slug')).toBeVisible();
		await expectElement(screen.getByLabelText('Published')).toBeVisible();
	});

	it('shows the date portion of an ISO timestamp in date fields without changing stored data', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config: dateConfig,
			blockRegistry,
			initialData: {
				title: 'Original title',
				published_at: '2013-05-23T14:52:00.000+00:00'
			},
			width: 1100
		});

		await expectElement(screen.getByLabelText('Published at')).toHaveValue('2013-05-23');

		await screen.getByRole('button', { name: 'Prepare submit' }).click();
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent(
			'"published_at":"2013-05-23T14:52:00.000+00:00"'
		);
	});

	it('stores date field changes as native date input values', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config: dateConfig,
			blockRegistry,
			initialData: {
				title: 'Original title',
				published_at: '2013-05-23T14:52:00.000+00:00'
			},
			width: 1100
		});

		await screen.getByLabelText('Published at').fill('2013-06-01');

		await screen.getByRole('button', { name: 'Prepare submit' }).click();
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent(
			'"published_at":"2013-06-01"'
		);
	});
});
