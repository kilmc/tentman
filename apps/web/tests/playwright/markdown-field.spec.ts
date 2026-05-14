import { expect, test } from '@playwright/test';

test.describe('MarkdownField harness', () => {
	test('renders the rich editor with the initial markdown content', async ({ page }) => {
		await page.goto('/__test__/markdown-field?scenario=basic');
		const field = page.getByTestId('basic-field');

		await expect(field.getByRole('heading', { name: 'Hello world', exact: true })).toBeVisible();
		await expect(field.getByTestId('basic-markdown-value')).toContainText('# Hello world');
	});

	test('stages inline images and serializes the draft ref into markdown', async ({ page }) => {
		await page.goto('/__test__/markdown-field?scenario=upload');
		const field = page.getByTestId('basic-field');
		await expect(field.getByRole('button', { name: 'Image' })).toBeEnabled();

		await field.getByTestId('markdown-image-input').setInputFiles({
			name: 'hero.png',
			mimeType: 'image/png',
			buffer: Buffer.from('image-bytes')
		});

		await expect(field.getByTestId('draft-create-calls')).toContainText(
			'"repoKey":"github:acme/docs"'
		);
		await expect(field.getByTestId('draft-create-calls')).toContainText(
			'"storagePath":"static/images/posts/"'
		);
		await expect(field.getByTestId('basic-markdown-value')).toContainText('draft-asset:uploaded');
	});

	test('inserts buy-button content components in the real browser flow', async ({ page }) => {
		await page.goto('/__test__/markdown-field?scenario=component-insert');
		const field = page.getByTestId('component-field');
		await field.getByRole('button', { name: 'Buy Button' }).click();
		await expect(field.getByText('Insert Buy Button')).toBeVisible();
		await field.getByLabel('URL *').fill('https://example.com/buy');
		await field.getByLabel('Label *').fill('Buy tickets');
		await field.getByRole('combobox').selectOption('secondary');
		await field.getByRole('button', { name: 'Save buy button' }).click();

		await expect(field.getByText('Buy button: Buy tickets')).toBeVisible();
		await expect(field.getByTestId('component-markdown-value')).toContainText(
			':buy-button[Buy tickets]{href="https://example.com/buy" variant="secondary"}'
		);
	});

	test('keeps incomplete component markers visible and repairs them with recovered values', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('broken-component-field');

		await expect(field.getByText(/Could not parse directive attributes/i)).toBeVisible();
		await expect(field.getByTestId('broken-component-field-save-state')).toContainText(
			'save-allowed'
		);

		await field.getByText(/Could not parse directive attributes/i).click();
		await field.getByText(/Could not parse directive attributes/i).click();
		await expect(field.getByText('Edit Buy Button')).toBeVisible();
		await expect(field.getByLabel('URL *')).toHaveValue('https://example.com/old');
		await expect(field.getByLabel('Label *')).toHaveValue('Old label');
		await field.getByRole('combobox').selectOption('secondary');
		await field.getByRole('button', { name: 'Save buy button' }).click();

		await expect(field.getByText('Buy button: Old label')).toBeVisible();
		await expect(field.getByTestId('broken-component-field-markdown-value')).toContainText(
			':buy-button[Old label]{href="https://example.com/old" variant="secondary"}'
		);
		await expect(field.getByTestId('broken-component-field-save-state')).toContainText(
			'save-allowed'
		);
	});

	test('surfaces disabled component diagnostics and blocks save', async ({ page }) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('disabled-component-field');

		await expect(
			field.getByText('Markdown field contains content component "buy-button" that is not enabled on this field')
		).toBeVisible();
		await expect(field.getByTestId('disabled-component-field-validation-errors')).toContainText('[]');
		await expect(field.getByTestId('disabled-component-field-save-state')).toContainText(
			'save-allowed'
		);
	});

	test('inserts referenced components with current content-item options', async ({ page }) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('reference-insert-field');

		await field.getByRole('button', { name: 'Project Gallery' }).click();
		await expect(field.getByText('Insert Project Gallery')).toBeVisible();
		await field.getByRole('combobox').selectOption('paper-notes');
		await field.getByRole('button', { name: 'Save project gallery' }).click();

		await expect(field.getByText('Project gallery: Paper notes')).toBeVisible();
		await expect(field.getByTestId('reference-insert-field-markdown-value')).toContainText(
			'::project-gallery{galleryId="paper-notes"}'
		);
		await expect(field.getByTestId('reference-insert-field-save-state')).toContainText(
			'save-allowed'
		);
	});

	test('edits referenced components from the rich preview and preserves reference labels', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('reference-edit-field');

		await field.getByText('Project gallery: City sketches').click();
		await field.getByText('Project gallery: City sketches').click();
		await expect(page.getByRole('button', { name: 'Edit project gallery' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Jump to Gallery ID' })).toBeVisible();
		await page.getByRole('button', { name: 'Edit project gallery' }).click();
		await expect(field.getByText('Edit Project Gallery')).toBeVisible();
		await expect(field.getByRole('combobox')).toHaveValue('city-sketches');
		await field.getByRole('combobox').selectOption('paper-notes');
		await field.getByRole('button', { name: 'Save project gallery' }).click();

		await expect(field.getByText('Project gallery: Paper notes')).toBeVisible();
		await expect(field.getByTestId('reference-edit-field-markdown-value')).toContainText(
			'::project-gallery{galleryId="paper-notes"}'
		);
	});

	test('replaces and deletes selected block component markers like selected content', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('reference-edit-field');
		const editor = field.getByTestId('markdown-rich-editor');

		await field.getByText('Project gallery: City sketches').click();
		await page.keyboard.press('Backspace');
		await expect(field.getByTestId('reference-edit-field-markdown-value')).toHaveText('');

		await page.getByTestId('reset-reference-edit').click();
		await field.getByText('Project gallery: City sketches').click();
		await page.keyboard.type('Replaced marker');
		await expect(field.getByTestId('reference-edit-field-markdown-value')).toContainText(
			'Replaced marker'
		);
		await expect(editor.getByText('Project gallery: City sketches')).toHaveCount(0);
	});

	test('blocks unresolved references until they are repaired from the rich editor', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('unresolved-reference-field');
		const editor = field.getByTestId('markdown-rich-editor');

		await expect(editor.getByText(/Could not resolve token "missing-gallery"/i)).toBeVisible();
		await expect(field.getByTestId('unresolved-reference-field-validation-errors')).toContainText(
			'[]'
		);
		await expect(field.getByTestId('unresolved-reference-field-save-state')).toContainText(
			'save-allowed'
		);

		await editor.getByText(/Could not resolve token "missing-gallery"/i).click();
		await editor.getByText(/Could not resolve token "missing-gallery"/i).click();
		await expect(page.getByRole('button', { name: 'Edit project gallery' })).toBeVisible();
		await page.getByRole('button', { name: 'Edit project gallery' }).click();
		await expect(field.getByText('Edit Project Gallery')).toBeVisible();
		await field.getByRole('combobox').selectOption('city-sketches');
		await field.getByRole('button', { name: 'Save project gallery' }).click();

		await expect(field.getByText('Project gallery: City sketches')).toBeVisible();
		await expect(field.getByTestId('unresolved-reference-field-save-state')).toContainText(
			'save-allowed'
		);
	});

	test('resolves sibling-object references through component defaults', async ({ page }) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('sibling-object-reference-field');

		await expect(field.getByText('Gallery embed: Homepage gallery')).toBeVisible();
		await expect(field.getByTestId('sibling-object-reference-field-markdown-value')).toContainText(
			'::gallery-embed'
		);
		await expect(field.getByTestId('sibling-object-reference-field-validation-errors')).toContainText(
			'[]'
		);
		await expect(field.getByTestId('sibling-object-reference-field-save-state')).toContainText(
			'save-allowed'
		);
	});

	test('jumps marker-only reference components to their source field on click', async ({ page }) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('sibling-object-reference-field');

		await field.getByText('Gallery embed: Homepage gallery').click();
		await field.getByText('Gallery embed: Homepage gallery').click();
		await expect(page.getByLabel('Gallery source field')).toBeFocused();
	});

	test('inserts top-level primitive references as first-class component bindings', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('top-level-reference-field');

		await field.getByRole('button', { name: 'Hero Embed' }).click();
		await expect(field.getByText('Insert Hero Embed')).toBeVisible();
		await expect(field.getByRole('combobox')).toHaveValue('main-hero');
		await field.getByRole('button', { name: 'Save hero embed' }).click();

		await expect(field.getByText('Hero embed: Homepage hero')).toBeVisible();
		await expect(field.getByTestId('top-level-reference-field-markdown-value')).toContainText(
			'::hero-embed{heroRef="main-hero"}'
		);
		await expect(field.getByTestId('top-level-reference-field-save-state')).toContainText(
			'save-allowed'
		);
	});

	test('inserts nested non-collection object references as first-class component bindings', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('nested-object-reference-field');

		await field.getByRole('button', { name: 'Social Card Embed' }).click();
		await expect(field.getByText('Insert Social Card Embed')).toBeVisible();
		await field.getByRole('combobox').selectOption('twitter-cover');
		await field.getByRole('button', { name: 'Save social card embed' }).click();

		await expect(field.getByText('Social card: Twitter card cover')).toBeVisible();
		await expect(field.getByTestId('nested-object-reference-field-markdown-value')).toContainText(
			'::social-card-embed{cardRef="twitter-cover"}'
		);
		await expect(field.getByTestId('nested-object-reference-field-save-state')).toContainText(
			'save-allowed'
		);
	});
});
