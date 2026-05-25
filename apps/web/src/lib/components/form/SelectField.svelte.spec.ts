import { describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import FormGeneratorSubmitHarness from '$lib/test/fixtures/FormGeneratorSubmitHarness.svelte';

describe('components/form/SelectField.svelte', () => {
	it('renders static options and stores the selected value', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
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

		await expectElement(screen.getByLabelText('Layout')).toHaveValue('stack');
		expect(Array.from(select.options).map((option) => option.textContent)).toContain('Inline row');

		select.value = 'inline';
		select.dispatchEvent(new Event('change', { bubbles: true }));

		await screen.getByRole('button', { name: 'Prepare submit' }).click();

		await expectElement(screen.getByTestId('submit-error')).toHaveTextContent('');
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent('{"layout":"inline"}');
	});

	it('validates required static selects', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
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

		await expectElement(screen.getByTestId('submit-error')).toHaveTextContent('Layout is required');
		await expectElement(screen.getByTestId('prepared-data')).toHaveTextContent('');
	});

	it('renders sourced group options from a navigation manifest', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'tentmanGroup',
						type: 'tentmanGroup',
						label: 'Group',
						required: true,
						collection: 'projects'
					}
				]
			},
			navigationManifest: {
				version: 1,
				collections: {
					projects: {
						items: [],
						groups: [
							{
								id: 'tent_group_identity',
								value: 'identity',
								label: 'Identity',
								items: []
							}
						]
					}
				}
			},
			initialData: {
				_tentmanGroupId: 'tent_group_identity'
			}
		});

		await expectElement(screen.getByLabelText('Group')).toHaveValue('tent_group_identity');
		const select = document.querySelector('select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Expected group select');
		}
		expect(Array.from(select.options).map((option) => option.textContent)).toContain('Identity');
	});

	it('adds a new navigation group and stores the new stable id', async () => {
		const addOption = vi.fn(async () => {});
		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'tentmanGroup',
						type: 'tentmanGroup',
						label: 'Group',
						collection: 'projects',
						addOption: true
					}
				]
			},
			navigationManifest: {
				version: 1,
				collections: {
					projects: {
						items: [],
						groups: [
							{
								id: 'tent_group_identity',
								value: 'identity',
								label: 'Identity',
								items: []
							}
						]
					}
				}
			},
			onaddselectoption: addOption,
			initialData: {
				_tentmanGroupId: 'tent_group_identity',
				group: 'identity'
			}
		});

		const select = document.querySelector('select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Expected group select');
		}

		select.value = '__tentman_add_group__';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await screen.getByPlaceholder('Group title').fill('Identity & Motion');
		await expectElement(screen.getByPlaceholder('group-value')).toHaveValue('identity-motion');
		await screen.getByRole('button', { name: 'Add', exact: true }).click();
		await screen.getByRole('button', { name: 'Prepare submit' }).click();

		expect(addOption).toHaveBeenCalledWith({
			collection: 'projects',
			id: expect.any(String),
			value: 'identity-motion',
			label: 'Identity & Motion'
		});

		const prepared = screen.getByTestId('prepared-data');
		await expectElement(prepared).toHaveTextContent('"_tentmanGroupId":"');
		await expectElement(prepared).toHaveTextContent('"group":"identity"');
		expect(prepared.element().textContent).not.toContain('"group":"identity-motion"');
	});

	it('lets authors cancel adding a new group', async () => {
		const addOption = vi.fn(async () => {});
		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'tentmanGroup',
						type: 'tentmanGroup',
						label: 'Group',
						collection: 'projects',
						addOption: true
					}
				]
			},
			navigationManifest: {
				version: 1,
				collections: {
					projects: {
						items: [],
						groups: [
							{
								id: 'tent_group_identity',
								value: 'identity',
								label: 'Identity',
								items: []
							}
						]
					}
				}
			},
			onaddselectoption: addOption,
			initialData: {
				_tentmanGroupId: 'tent_group_identity'
			}
		});

		const select = document.querySelector('select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Expected group select');
		}

		await expectElement(screen.getByLabelText('Group')).toHaveValue('tent_group_identity');
		select.value = 'tent_group_identity';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		select.value = '__tentman_add_group__';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await screen.getByPlaceholder('Group title').fill('Temporary Group');
		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expectElement(screen.getByPlaceholder('Group title')).not.toBeInTheDocument();
		expect(addOption).not.toHaveBeenCalled();
		await expectElement(screen.getByLabelText('Group')).toHaveValue('tent_group_identity');
	});
});
