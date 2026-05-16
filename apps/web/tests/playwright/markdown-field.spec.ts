import { devices, expect, test } from '@playwright/test';

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

	test('double-clicking editable-only components opens the edit dialog', async ({ page }) => {
		await page.goto('/__test__/markdown-field?scenario=component-edit');
		const field = page.getByTestId('component-field');

		await expect(field.getByTestId('component-markdown-value')).toContainText(
			':buy-button[Buy now]{href="https://example.com/shop" variant="default"}'
		);
		await field.locator('[data-tentman-content-component-node="buy-button"]').dblclick();
		await expect(field.getByText('Edit Buy Button')).toBeVisible();
		await expect(field.getByLabel('URL *')).toHaveValue('https://example.com/shop');
		await expect(field.getByLabel('Label *')).toHaveValue('Buy now');
	});

	test('modifier-click opens href-bearing content components directly', async ({ page }) => {
		await page.goto('/__test__/markdown-field?scenario=component-edit');
		const field = page.getByTestId('component-field');
		const component = field.locator('[data-tentman-content-component-node="buy-button"]');

		const popupPromise = page.waitForEvent('popup');
		await component.click({ modifiers: ['Meta'] });
		const popup = await popupPromise;
		await popup.waitForLoadState('domcontentloaded');
		await expect(popup).toHaveURL('https://example.com/shop');
		await popup.close();
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

		await field.getByText(/Could not parse directive attributes/i).dblclick();
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

		await field.getByText('Project gallery: City sketches').dblclick();
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
		const editorSurface = editor.locator('.ProseMirror');

		await field.getByText('Project gallery: City sketches').click();
		await expect(editorSurface).toHaveAttribute(
			'data-tentman-selection-kind',
			/NodeSelection$/
		);
		await expect(editorSurface).toHaveAttribute(
			'data-tentman-selected-node-type',
			'contentComponentProjectGallery'
		);
		await page.keyboard.press('Backspace');
		await expect(field.getByTestId('reference-edit-field-markdown-value')).toHaveText('');

		await page.getByTestId('reset-reference-edit').click();
		await field.getByText('Project gallery: City sketches').click();
		await page.keyboard.press('Delete');
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

		await editor.getByText(/Could not resolve token "missing-gallery"/i).dblclick();
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

	test('undo restores marker-only reference components after deletion without preview errors', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('sibling-object-reference-field');
		const editor = field.getByTestId('markdown-rich-editor');

		await field.getByText('Gallery embed: Homepage gallery').click();
		await page.keyboard.press('Backspace');
		await expect(field.getByTestId('sibling-object-reference-field-markdown-value')).toHaveText('');

		await page.keyboard.press('Meta+z');
		await expect(field.getByText('Gallery embed: Homepage gallery')).toBeVisible();
		await expect(field.getByTestId('sibling-object-reference-field-markdown-value')).toContainText(
			'::gallery-embed'
		);
		await expect(editor.getByText(/Invalid gallery-embed/i)).toHaveCount(0);
	});

	test('keeps rich editor content visible when switching to markdown and back', async ({ page }) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('sibling-object-reference-field');

		await expect(field.getByText('Gallery embed: Homepage gallery')).toBeVisible();

		await field.getByRole('button', { name: 'Markdown' }).click();
		await expect(field.getByLabel('Sibling object reference body')).toHaveValue('::gallery-embed');

		await field.getByRole('button', { name: 'Rich' }).click();
		await expect(field.getByText('Gallery embed: Homepage gallery')).toBeVisible();
	});

	test('cmd-enter activates marker-only reference components like double click', async ({ page }) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('sibling-object-reference-field');

		await field.getByText('Gallery embed: Homepage gallery').click();
		await page.keyboard.press('Meta+Enter');
		await expect(page.getByLabel('Gallery source field')).toBeFocused();
	});

	test('jumps marker-only reference components to their source field on click', async ({ page }) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('sibling-object-reference-field');
		await field.getByText('Gallery embed: Homepage gallery').dblclick();
		await expect(page.getByLabel('Gallery source field')).toBeFocused();
	});

	test('cmd-enter opens the action popover for mixed-capability components like double click', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('reference-edit-field');

		await field.getByText('Project gallery: City sketches').click();
		await page.keyboard.press('Meta+Enter');
		await expect(page.getByRole('button', { name: 'Edit project gallery' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Jump to Gallery ID' })).toBeVisible();
	});

	test('double-clicking no-action marker components leaves them selected without opening UI', async ({
		page
	}) => {
		await page.goto('/__test__/markdown-field');
		const field = page.getByTestId('static-marker-field');
		const editorSurface = field.locator('.ProseMirror');
		const marker = field.locator('[data-tentman-content-component-node="static-marker"]');

		await page.getByTestId('reset-static-marker').click();
		await marker.dblclick();

		await expect(editorSurface).toHaveAttribute(
			'data-tentman-selection-kind',
			/NodeSelection$/
		);
		await expect(editorSurface).toHaveAttribute(
			'data-tentman-selected-node-type',
			'contentComponentStaticMarker'
		);
		await expect(field.getByText('Static marker preview')).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(field.getByTestId('static-marker-field-markdown-value')).toHaveText(
			'::static-marker'
		);
	});

	test('touch tap keeps mixed-capability components selection-first on mobile', async ({
		browser
	}) => {
		const context = await browser.newContext({
			...devices['iPhone 13']
		});
		const page = await context.newPage();

		try {
			await page.goto('/__test__/markdown-field');
			const field = page.getByTestId('reference-edit-field');
			const editorSurface = field.locator('.ProseMirror');

			await field
				.locator('[data-tentman-content-component-node="project-gallery"]')
				.tap();

			await expect(editorSurface).toHaveAttribute(
				'data-tentman-selection-kind',
				/NodeSelection$/
			);
			await expect(editorSurface).toHaveAttribute(
				'data-tentman-selected-node-type',
				'contentComponentProjectGallery'
			);
			await expect(page.getByRole('button', { name: 'Edit project gallery' })).toHaveCount(0);
			await expect(page.getByRole('button', { name: 'Jump to Gallery ID' })).toHaveCount(0);
			await expect(page.getByText('Edit Project Gallery')).toHaveCount(0);
			await expect(page.getByLabel('Gallery ID source')).not.toBeFocused();
		} finally {
			await context.close();
		}
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
