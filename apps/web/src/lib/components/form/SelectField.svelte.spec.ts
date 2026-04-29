import { describe, expect, it, vi } from 'vitest';
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
		expect(Array.from(select.options).map((option) => option.textContent)).toContain('Inline row');

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

	it('renders sourced group options from a navigation manifest', async () => {
		const screen = render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'group',
						type: 'select',
						label: 'Group',
						required: true,
						options: {
							source: 'tentman.navigationGroups',
							collection: 'projects'
						}
					}
				]
			},
			navigationManifest: {
				version: 1,
				collections: {
					projects: {
						items: [],
						groups: [{ id: 'identity', label: 'Identity', items: [] }]
					}
				}
			},
			initialData: {
				group: 'identity'
			}
		});

		await expect.element(screen.getByLabelText('Group')).toHaveValue('identity');
		const select = document.querySelector('select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Expected group select');
		}
		expect(Array.from(select.options).map((option) => option.textContent)).toContain('Identity');
	});

	it('adds a new navigation group and selects it', async () => {
		const addOption = vi.fn(async () => {});
		const screen = render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'group',
						type: 'select',
						label: 'Group',
						options: {
							source: 'tentman.navigationGroups',
							collection: 'projects',
							addOption: true
						}
					}
				]
			},
			navigationManifest: {
				version: 1,
				collections: {
					projects: {
						items: [],
						groups: [{ id: 'identity', label: 'Identity', items: [] }]
					}
				}
			},
			onaddselectoption: addOption,
			initialData: {
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
		await expect.element(screen.getByPlaceholder('group-id')).toHaveValue('identity-motion');
		await screen.getByRole('button', { name: 'Add', exact: true }).click();
		await screen.getByRole('button', { name: 'Prepare submit' }).click();

		expect(addOption).toHaveBeenCalledWith({
			collection: 'projects',
			id: 'identity-motion',
			label: 'Identity & Motion'
		});
		await expect.element(screen.getByTestId('prepared-data')).toHaveTextContent(
			'{"group":"identity-motion"}'
		);
	});

	it('lets authors cancel adding a new group', async () => {
		const addOption = vi.fn(async () => {});
		const screen = render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Projects',
				content: {
					mode: 'file',
					path: 'src/content/projects.json'
				},
				blocks: [
					{
						id: 'group',
						type: 'select',
						label: 'Group',
						options: {
							source: 'tentman.navigationGroups',
							collection: 'projects',
							addOption: true
						}
					}
				]
			},
			navigationManifest: {
				version: 1,
				collections: {
					projects: {
						items: [],
						groups: [{ id: 'identity', label: 'Identity', items: [] }]
					}
				}
			},
			onaddselectoption: addOption,
			initialData: {
				group: 'identity'
			}
		});

		const select = document.querySelector('select');
		if (!(select instanceof HTMLSelectElement)) {
			throw new Error('Expected group select');
		}

		await expect.element(screen.getByLabelText('Group')).toHaveValue('identity');
		select.value = 'identity';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		select.value = '__tentman_add_group__';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		await screen.getByPlaceholder('Group title').fill('Temporary Group');
		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(screen.getByPlaceholder('Group title')).not.toBeInTheDocument();
		expect(addOption).not.toHaveBeenCalled();
		await expect.element(screen.getByLabelText('Group')).toHaveValue('identity');
	});
});
