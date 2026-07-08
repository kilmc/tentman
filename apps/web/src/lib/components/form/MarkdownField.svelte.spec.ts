import { describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { expectElement, render } from '$lib/test-support/browser-test';
import MarkdownField from './MarkdownField.svelte';
import type { ContentComponentRegistry } from '$lib/content-components/registry';
import SemanticMarkdownFieldHarness from '$lib/test/fixtures/SemanticMarkdownFieldHarness.svelte';

const emptyContentComponentRegistry: ContentComponentRegistry = {
	components: [],
	errors: [],
	getByName() {
		return undefined;
	}
};

describe('components/form/MarkdownField.svelte', () => {
	it('does not emit a change when the rich editor is only focused', async () => {
		const onchange = vi.fn();
		await render(MarkdownField, {
			label: 'Body',
			value: 'Original body\n',
			onchange,
			testAdapters: {
				componentMode: 'local',
				loadContentComponentRegistryForMode: async () => emptyContentComponentRegistry
			}
		});

		await vi.waitFor(() => {
			expect(document.querySelector<HTMLElement>('.ProseMirror')).toBeTruthy();
		});

		await document.querySelector<HTMLElement>('.ProseMirror')?.click();

		expect(onchange).not.toHaveBeenCalled();
	});

	it('returns to semantic clean when markdown text returns to the baseline document', async () => {
		const screen = await render(SemanticMarkdownFieldHarness);

		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('clean');

		await screen.getByRole('button', { name: 'Markdown' }).click();
		await screen.getByLabelText('Body').fill('Original bodyx');
		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('dirty');

		await screen.getByLabelText('Body').fill('Original body');
		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('clean');
	});

	it('returns to semantic clean when a rich editor insertion is deleted', async () => {
		const screen = await render(SemanticMarkdownFieldHarness, {
			value: 'Original body',
			baseline: 'Original body'
		});

		await screen.getByText('Original body').click();
		await userEvent.keyboard('p');
		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('dirty');

		await userEvent.keyboard('{Backspace}');
		await expectElement(screen.getByTestId('semantic-dirty-state')).toHaveTextContent('clean');
	});
});
