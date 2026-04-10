import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ArrayField from './ArrayField.svelte';

const blockRegistry = {
	entries: [],
	get: () => undefined,
	has: () => false,
	getAdapter: () => undefined
};

describe('components/form/ArrayField.svelte', () => {
	it('opens structured repeatables in a dedicated editor panel after selection', async () => {
		const onchange = vi.fn();
		const screen = render(ArrayField, {
			label: 'Sections',
			value: [
				{ title: 'Intro', body: 'Welcome' },
				{ title: 'Credits', body: 'Thanks' }
			],
			blocks: [
				{ id: 'title', type: 'text', label: 'Title' },
				{ id: 'body', type: 'textarea', label: 'Body' }
			],
			itemLabel: 'Section',
			blockRegistry,
			onchange
		});

		await expect.element(screen.getByRole('button', { name: /Section 1: Intro/ })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: /Section 2: Credits/ })).toBeVisible();
		await expect.element(screen.getByRole('heading', { name: 'Section 1: Intro' })).not.toBeInTheDocument();

		await screen.getByRole('button', { name: /Section 2: Credits/ }).click();

		await expect.element(screen.getByRole('heading', { name: 'Section 2: Credits' })).toBeVisible();
		await expect.element(screen.getByLabelText('Title')).toHaveValue('Credits');
	});

	it('keeps primitive arrays inline', async () => {
		const screen = render(ArrayField, {
			label: 'Tags',
			value: ['design', 'music'],
			blocks: [],
			blockRegistry
		});

		await expect
			.element(screen.getByRole('textbox', { name: 'Tags item 1' }))
			.toHaveValue('design');
		await expect.element(screen.getByRole('textbox', { name: 'Tags item 2' })).toHaveValue('music');
		await expect.element(screen.getByRole('heading', { name: /design/ })).not.toBeInTheDocument();
	});
});
