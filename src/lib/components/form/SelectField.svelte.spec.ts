import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import FormGeneratorSubmitHarness from '$lib/test/fixtures/FormGeneratorSubmitHarness.svelte';

describe('components/form/SelectField.svelte', () => {
	it('renders static options and stores the selected value', async () => {
		const screen = render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Gallery',
				content: {
					mode: 'file',
					path: 'src/content/gallery.json'
				},
				blocks: [
					{
						id: 'layout',
						type: 'select',
						label: 'Layout',
						required: true,
						options: [
							{ value: 'stack', label: 'Stack' },
							{ value: 'inline', label: 'Inline row' }
						]
					}
				]
			},
			initialData: {
				layout: 'stack'
			}
		});

		const select = document.querySelector('select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Expected layout select');
		}

		await expect.element(screen.getByLabelText('Layout')).toHaveValue('stack');
		await expect.element(screen.getByRole('option', { name: 'Inline row' })).toBeVisible();

		select.value = 'inline';
		select.dispatchEvent(new Event('change', { bubbles: true }));

		await screen.getByRole('button', { name: 'Prepare submit' }).click();

		await expect.element(screen.getByTestId('submit-error')).toHaveTextContent('');
		await expect.element(screen.getByTestId('prepared-data')).toHaveTextContent('{"layout":"inline"}');
	});

	it('validates required static selects', async () => {
		const screen = render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Gallery',
				content: {
					mode: 'file',
					path: 'src/content/gallery.json'
				},
				blocks: [
					{
						id: 'layout',
						type: 'select',
						label: 'Layout',
						required: true,
						options: [{ value: 'stack', label: 'Stack' }]
					}
				]
			},
			initialData: {
				layout: ''
			}
		});

		await screen.getByRole('button', { name: 'Prepare submit' }).click();

		await expect.element(screen.getByTestId('submit-error')).toHaveTextContent('Layout is required');
		await expect.element(screen.getByTestId('prepared-data')).toHaveTextContent('');
	});
});
