import { describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import ArrayField from './ArrayField.svelte';
import FormGenerator from './FormGenerator.svelte';
import FormGeneratorSubmitHarness from '$lib/test/fixtures/FormGeneratorSubmitHarness.svelte';

vi.mock('$lib/features/draft-assets/image-resolver', () => ({
	resolveClientAssetUrl: vi.fn(async (value: string | null | undefined) => value ?? null)
}));

const blockRegistry = {
	entries: [],
	get: () => undefined,
	has: () => false,
	getAdapter: () => undefined
};

describe('components/form/ArrayField.svelte', () => {
	it('opens structured repeatables in a dedicated editor panel after selection', async () => {
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
							{ id: 'body', type: 'textarea', label: 'Body' }
						]
					}
				]
			},
			initialData: {
				sections: [
					{ title: 'Intro', body: 'Welcome' },
					{ title: 'Credits', body: 'Thanks' }
				]
			}
		});

		await expectElement(screen.getByRole('button', { name: /Section 1: Intro/ })).toBeVisible();
		await expectElement(screen.getByRole('button', { name: /Section 2: Credits/ })).toBeVisible();
		await expectElement(screen.getByRole('heading', { name: 'Section 1: Intro' }))
			.not.toBeInTheDocument();

		await screen.getByRole('button', { name: /Section 2: Credits/ }).click();

		await expectElement(screen.getByRole('heading', { name: 'Section 2: Credits' })).toBeVisible();
		await expectElement(screen.getByLabelText('Title')).toHaveValue('Credits');
		await expectElement(screen.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();

		await screen.getByLabelText('Title').fill('Acknowledgements');
		await expectElement(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
		await expectElement(screen.getByRole('button', { name: /Section 2: Acknowledgements/ }))
			.not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Save' }).click();

		await expectElement(screen.getByRole('button', { name: 'Edit Section 2: Acknowledgements' }))
			.toBeVisible();
		await expectElement(screen.getByRole('heading', { name: 'Section 2: Acknowledgements' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();
	});

	it('does not add structured repeatable drafts until Save', async () => {
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
						id: 'images',
						type: 'block',
						label: 'Images',
						collection: true,
						itemLabel: 'Image',
						blocks: [
							{ id: 'src', type: 'image', label: 'Image path' },
							{ id: 'alt', type: 'text', label: 'Alt text' },
							{ id: 'size', type: 'number', label: 'Size' }
						]
					}
				]
			},
			initialData: {
				images: []
			}
		});

		await expectElement(screen.getByRole('button', { name: 'Add Image' })).toBeVisible();
		await screen.getByRole('button', { name: 'Add Image' }).click();

		await expectElement(screen.getByRole('heading', { name: 'New Image' })).toBeVisible();
		await expectElement(screen.getByText('No items yet')).toBeVisible();
		await expectElement(screen.getByRole('button', { name: /Edit Image 1/ }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByLabelText('Image path')).toHaveValue('');
		await expectElement(screen.getByLabelText('Alt text')).toHaveValue('');
		await expectElement(screen.getByLabelText('Size')).toHaveValue(0);
		await expectElement(screen.getByRole('button', { name: 'Add', exact: true })).toBeDisabled();
		await expectElement(screen.getByRole('button', { name: /Remove New Image/ }))
			.not.toBeInTheDocument();

		await screen.getByLabelText('Alt text').fill('Opening view');
		await screen.getByLabelText('Size').fill('1200');

		await expectElement(screen.getByRole('button', { name: 'Add', exact: true }))
			.not.toBeDisabled();
		await expectElement(screen.getByRole('button', { name: /Edit Image 1/ }))
			.not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Add', exact: true }).click();

		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.toBeVisible();
		await expectElement(screen.getByRole('heading', { name: 'Image 1: Opening view' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByLabelText('Alt text')).not.toBeInTheDocument();
		await expectElement(screen.getByLabelText('Size')).not.toBeInTheDocument();
		await expectElement(screen.getByRole('button', { name: 'Add', exact: true }))
			.not.toBeInTheDocument();
	});

	it('discarding a new structured repeatable draft with Cancel does not add it', async () => {
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
						id: 'images',
						type: 'block',
						label: 'Images',
						collection: true,
						itemLabel: 'Image',
						blocks: [
							{ id: 'src', type: 'image', label: 'Image path' },
							{ id: 'alt', type: 'text', label: 'Alt text' }
						]
					}
				]
			},
			initialData: {
				images: []
			}
		});

		await screen.getByRole('button', { name: 'Add Image' }).click();
		await screen.getByLabelText('Alt text').fill('Opening view');
		await expectElement(screen.getByRole('button', { name: 'Add', exact: true }))
			.not.toBeDisabled();

		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expectElement(screen.getByRole('heading', { name: 'New Image' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByText('No items yet')).toBeVisible();
		await expectElement(screen.getByRole('button', { name: /Edit Image 1/ }))
			.not.toBeInTheDocument();
	});

	it('uses compact human labels and previews for image repeatables', async () => {
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
						id: 'images',
						type: 'block',
						label: 'Images',
						collection: true,
						itemLabel: 'Image',
						blocks: [
							{ id: 'src', type: 'image', label: 'Image path' },
							{ id: 'alt', type: 'text', label: 'Alt text' }
						]
					}
				]
			},
			initialData: {
				images: [{ src: '/images/hero.jpg', alt: 'Opening view' }]
			}
		});

		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.toBeVisible();
		await expectElement(screen.getByText('Image 1')).toBeVisible();
		await expectElement(screen.getByText('Opening view')).toBeVisible();
		await expectElement(screen.getByTestId('repeatable-preview-0')).toBeInTheDocument();
	});

	it('focuses nested repeatable items instead of reopening their parent editor', async () => {
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
						id: 'galleries',
						type: 'block',
						label: 'Galleries',
						collection: true,
						itemLabel: 'Gallery',
						blocks: [
							{ id: 'id', type: 'text', label: 'Gallery ID' },
							{
								id: 'images',
								type: 'block',
								label: 'Images',
								collection: true,
								itemLabel: 'Image',
								blocks: [
									{ id: 'src', type: 'image', label: 'Image path' },
									{ id: 'alt', type: 'text', label: 'Alt text' }
								]
							}
						]
					}
				]
			},
			initialData: {
				galleries: [
					{
						id: 'main',
						images: [{ src: '/images/hero.jpg', alt: 'Opening view' }]
					}
				]
			}
		});

		await screen.getByRole('button', { name: 'Edit Gallery 1: main' }).click();
		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' })).toBeVisible();
		await expectElement(screen.getByLabelText('Gallery ID')).toHaveValue('main');

		await screen.getByRole('button', { name: 'Edit Image 1: Opening view' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Image 1: Opening view' }))
			.toBeVisible();
		await expectElement(screen.getByRole('img', { name: 'Image path' })).toBeVisible();
		await expectElement(screen.getByText('/images/hero.jpg')).toBeVisible();
		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByLabelText('Gallery ID')).not.toBeInTheDocument();

		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

		await expectElement(screen.getByRole('heading', { name: 'Image 1: Opening view' }))
			.toBeVisible();
		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Back to Gallery 1: main' }).click();
		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' })).toBeVisible();
		await screen.getByLabelText('Image 1: Opening view actions').click();
		await screen.getByRole('button', { name: 'Remove Image 1: Opening view' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' })).toBeVisible();
		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByText('No items yet')).toBeVisible();
	});

	it('returns to the containing repeatable list after saving a nested draft', async () => {
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
						id: 'galleries',
						type: 'block',
						label: 'Galleries',
						collection: true,
						itemLabel: 'Gallery',
						blocks: [
							{ id: 'id', type: 'text', label: 'Gallery ID' },
							{
								id: 'images',
								type: 'block',
								label: 'Images',
								collection: true,
								itemLabel: 'Image',
								blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }]
							}
						]
					}
				]
			},
			initialData: {
				galleries: [{ id: 'main', images: [] }]
			}
		});

		await screen.getByRole('button', { name: 'Edit Gallery 1: main' }).click();
		await screen.getByRole('button', { name: 'Add Image' }).click();

		await expectElement(screen.getByRole('heading', { name: 'New Image' })).toBeVisible();

		await screen.getByLabelText('Alt text').fill('Opening view');
		await expectElement(screen.getByRole('button', { name: 'Add', exact: true }))
			.not.toBeDisabled();
		await screen.getByRole('button', { name: 'Add', exact: true }).click();

		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' })).toBeVisible();
		await expectElement(screen.getByRole('heading', { name: 'Image 1: Opening view' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.toBeVisible();
		await expectElement(screen.getByRole('button', { name: 'Save' })).not.toBeDisabled();
		await screen.getByRole('button', { name: 'Save' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' }))
			.not.toBeInTheDocument();
		await screen.getByRole('button', { name: 'Edit Gallery 1: main' }).click();
		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.toBeVisible();
	});

	it('keeps nested repeatable changes staged when closing their parent panel', async () => {
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
						id: 'galleries',
						type: 'block',
						label: 'Galleries',
						collection: true,
						itemLabel: 'Gallery',
						blocks: [
							{ id: 'id', type: 'text', label: 'Gallery ID' },
							{
								id: 'images',
								type: 'block',
								label: 'Images',
								collection: true,
								itemLabel: 'Image',
								blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }]
							}
						]
					}
				]
			},
			initialData: {
				galleries: [{ id: 'main', images: [] }]
			}
		});

		await screen.getByRole('button', { name: 'Edit Gallery 1: main' }).click();
		await screen.getByRole('button', { name: 'Add Image' }).click();
		await screen.getByLabelText('Alt text').fill('Opening view');
		await screen.getByRole('button', { name: 'Add', exact: true }).click();

		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' })).toBeVisible();
		document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));

		await expectElement(screen.getByRole('heading', { name: 'Gallery 1: main' })).toBeVisible();
		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.toBeVisible();
	});

	it('opens repeatable items when optional field values are missing', async () => {
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
							{ id: 'body', type: 'textarea', label: 'Body' }
						]
					}
				]
			},
			initialData: {
				sections: [{ title: 'Intro' }]
			}
		});

		await screen.getByRole('button', { name: 'Edit Section 1: Intro' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Section 1: Intro' })).toBeVisible();
		await expectElement(screen.getByLabelText('Title')).toHaveValue('Intro');
		await expectElement(screen.getByLabelText('Body')).toHaveValue('');
	});

	it('switches directly to another repeatable item when the side panel is already open', async () => {
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
						blocks: [{ id: 'title', type: 'text', label: 'Title' }]
					}
				]
			},
			initialData: {
				sections: [{ title: 'Intro' }, { title: 'Credits' }]
			}
		});

		await screen.getByRole('button', { name: 'Edit Section 1: Intro' }).click();
		await expectElement(screen.getByRole('heading', { name: 'Section 1: Intro' })).toBeVisible();

		await screen.getByRole('button', { name: 'Edit Section 2: Credits' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Section 2: Credits' }))
			.toBeVisible();
		await expectElement(screen.getByRole('heading', { name: 'Section 1: Intro' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByLabelText('Title')).toHaveValue('Credits');
	});

	it('keeps the side panel open while interacting with fields inside it', async () => {
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
						blocks: [{ id: 'title', type: 'text', label: 'Title' }]
					}
				]
			},
			initialData: {
				sections: [{ title: 'Intro' }]
			}
		});

		await screen.getByRole('button', { name: 'Edit Section 1: Intro' }).click();
		await expectElement(screen.getByRole('heading', { name: 'Section 1: Intro' })).toBeVisible();

		await screen.getByLabelText('Title').click();
		await expectElement(screen.getByRole('heading', { name: 'Section 1: Intro' })).toBeVisible();

		await screen.getByLabelText('Title').fill('Updated intro');
		await expectElement(screen.getByRole('heading', { name: 'Section 1: Updated intro' })).toBeVisible();
		await expectElement(screen.getByLabelText('Title')).toHaveValue('Updated intro');
	});

	it('keeps removal in the overflow menu and closes after removing the last item', async () => {
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
						blocks: [{ id: 'title', type: 'text', label: 'Title' }]
					}
				]
			},
			initialData: {
				sections: [{ title: 'Only section' }]
			}
		});

		await screen.getByRole('button', { name: 'Edit Section 1: Only section' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Section 1: Only section' }))
			.toBeVisible();
		await expectElement(screen.getByRole('button', { name: 'Back to Sections' })).not.toBeInTheDocument();
		await expectElement(screen.getByRole('button', { name: 'Save' })).not.toBeInTheDocument();
		await expectElement(screen.getByRole('button', { name: 'Remove' })).not.toBeInTheDocument();

		await screen.getByLabelText('Section 1: Only section actions').click();
		await screen.getByRole('button', { name: 'Remove Section 1: Only section' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Section 1: Only section' }))
			.not.toBeInTheDocument();
		await expectElement(screen.getByText('No items yet')).toBeVisible();
	});

	it('prepares outer submit with dirty edits from an existing repeatable panel', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
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
						blocks: [{ id: 'title', type: 'text', label: 'Title' }]
					}
				]
			},
			initialData: {
				sections: [{ title: 'Intro' }]
			}
		});

		await screen.getByRole('button', { name: 'Edit Section 1: Intro' }).click();
		await screen.getByLabelText('Title').fill('Opening');

		await expectElement(screen.getByTestId('form-dirty-state')).toHaveTextContent('dirty');

		await screen.getByRole('button', { name: 'Prepare submit' }).click();

		await expectElement(screen.getByTestId('submit-error')).toHaveTextContent('');
		await expectElement(screen.getByTestId('prepared-data'))
			.toHaveTextContent('{"sections":[{"title":"Opening"}]}');
		await expectElement(screen.getByRole('heading', { name: 'Section 1: Intro' }))
			.not.toBeInTheDocument();
	});

	it('blocks outer submit when a new repeatable panel draft is dirty but not added', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Page',
				content: {
					mode: 'file',
					path: 'src/content/page.json'
				},
				blocks: [
					{
						id: 'images',
						type: 'block',
						label: 'Images',
						collection: true,
						itemLabel: 'Image',
						blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }]
					}
				]
			},
			initialData: {
				images: []
			}
		});

		await screen.getByRole('button', { name: 'Add Image' }).click();
		await screen.getByLabelText('Alt text').fill('Opening view');
		await screen.getByRole('button', { name: 'Prepare submit' }).click();

		await expectElement(screen.getByTestId('submit-error'))
			.toHaveTextContent('Add New Image or cancel before saving the page.');
		await expectElement(screen.getByRole('heading', { name: 'New Image' })).toBeVisible();
		await expectElement(screen.getByRole('button', { name: /Edit Image 1/ }))
			.not.toBeInTheDocument();
	});

	it('keeps simple structured objects inline when they do not contain nested collections', async () => {
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
						id: 'hero',
						type: 'block',
						label: 'Hero',
						blocks: [
							{ id: 'headline', type: 'text', label: 'Headline' },
							{ id: 'summary', type: 'textarea', label: 'Summary' }
						]
					}
				]
			},
			initialData: {
				hero: {
					headline: 'Opening',
					summary: 'Welcome'
				}
			}
		});

		await expectElement(screen.getByLabelText('Headline')).toHaveValue('Opening');
		await expectElement(screen.getByLabelText('Summary')).toHaveValue('Welcome');
		await expectElement(screen.getByRole('button', { name: 'Edit Hero' }))
			.not.toBeInTheDocument();
	});

	it('renders structured objects with nested collections as a panel card', async () => {
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
						id: 'gallery',
						type: 'block',
						label: 'Gallery',
						blocks: [
							{ id: 'layout', type: 'text', label: 'Layout' },
							{
								id: 'images',
								type: 'block',
								label: 'Images',
								collection: true,
								itemLabel: 'Image',
								blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }]
							}
						]
					}
				]
			},
			initialData: {
				gallery: {
					layout: 'grid',
					images: [{ alt: 'Opening view' }]
				}
			}
		});

		await expectElement(screen.getByRole('button', { name: 'Edit Gallery' })).toBeVisible();
		await expectElement(screen.getByLabelText('Layout')).not.toBeInTheDocument();
		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Edit Gallery' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Gallery' })).toBeVisible();
		await expectElement(screen.getByLabelText('Layout')).toHaveValue('grid');
		await expectElement(screen.getByRole('button', { name: 'Edit Image 1: Opening view' }))
			.toBeVisible();
	});

	it('keeps nested collection changes inside an object panel staged until page submit', async () => {
		const screen = await render(FormGeneratorSubmitHarness, {
			config: {
				type: 'content',
				label: 'Project',
				content: {
					mode: 'file',
					path: 'src/content/project.json'
				},
				blocks: [
					{
						id: 'gallery',
						type: 'block',
						label: 'Gallery',
						blocks: [
							{ id: 'layout', type: 'text', label: 'Layout' },
							{
								id: 'images',
								type: 'block',
								label: 'Images',
								collection: true,
								itemLabel: 'Image',
								blocks: [{ id: 'alt', type: 'text', label: 'Alt text' }]
							}
						]
					}
				]
			},
			initialData: {
				gallery: {
					layout: 'grid',
					images: []
				}
			}
		});

		await screen.getByRole('button', { name: 'Edit Gallery' }).click();
		await screen.getByRole('button', { name: 'Add Image' }).click();
		await screen.getByLabelText('Alt text').fill('Opening view');
		await screen.getByRole('button', { name: 'Add', exact: true }).click();

		await expectElement(screen.getByRole('heading', { name: 'Gallery' })).toBeVisible();
		await expectElement(screen.getByTestId('form-dirty-state')).toHaveTextContent('dirty');

		await screen.getByRole('button', { name: 'Prepare submit' }).click();

		await expectElement(screen.getByTestId('submit-error')).toHaveTextContent('');
		await expectElement(screen.getByTestId('prepared-data'))
			.toHaveTextContent('{"gallery":{"layout":"grid","images":[{"alt":"Opening view"}]}}');
	});

	it('keeps primitive arrays inline', async () => {
		const screen = await render(ArrayField, {
			label: 'Tags',
			value: ['design', 'music'],
			blocks: [],
			blockRegistry
		});

		await expectElement(screen.getByRole('textbox', { name: 'Tags item 1' }))
			.toHaveValue('design');
		await expectElement(screen.getByRole('textbox', { name: 'Tags item 2' })).toHaveValue('music');
		await expectElement(screen.getByRole('heading', { name: /design/ })).not.toBeInTheDocument();
	});
});
