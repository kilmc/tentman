import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectElement, render } from '$lib/test-support/browser-test';
import FormGeneratorSubmitHarness from '$lib/test/fixtures/FormGeneratorSubmitHarness.svelte';

const config = {
	type: 'content' as const,
	label: 'Posts',
	content: {
		mode: 'file' as const,
		path: 'src/content/posts.json'
	},
	blocks: [{ id: 'topics', type: 'tags', label: 'Topics', required: true }]
};

describe('components/form/TagsField.svelte', () => {
	it('creates and removes tags as a string array', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config,
			initialData: {
				topics: ['process']
			}
		});

		const input = screen.getByLabelText('Topics');
		await input.fill('design-system');
		await input.click();
		await userEvent.keyboard('{Enter}');

		await expectElement(screen.getByText('design-system')).toBeVisible();
		await screen.getByRole('button', { name: 'Remove process' }).click();
		await expectElement(screen.getByText('process')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Prepare submit' }).click();
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent(
			'{"topics":["design-system"]}'
		);
	});

	it('suggests existing tags from collection items', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config,
			existingItems: [
				{ topics: ['design-system', 'field_notes'] },
				{ topics: ['process'] }
			]
		});

		const input = screen.getByLabelText('Topics');
		await input.fill('des');

		await expectElement(screen.getByRole('option', { name: 'design-system' })).toBeVisible();
		await input.click();
		await userEvent.keyboard('{Enter}');

		await screen.getByRole('button', { name: 'Prepare submit' }).click();
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent(
			'{"topics":["design-system"]}'
		);
	});

	it('supports backspace removal and validates invalid tags', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config,
			initialData: {
				topics: ['process']
			}
		});

		const input = screen.getByLabelText('Topics');
		await input.click();
		await userEvent.keyboard('{Backspace}');
		await expectElement(screen.getByText('process')).not.toBeInTheDocument();

		await input.fill('bad tag');
		await input.click();
		await userEvent.keyboard('{Enter}');
		await expectElement(screen.getByText('bad tag')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Prepare submit' }).click();
		await expectElement(screen.getByTestId('submit-error')).toHaveTextContent('Topics is required');
	});
});
