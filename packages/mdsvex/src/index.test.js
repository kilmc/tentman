import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { compile } from 'mdsvex';
import remarkDirective from 'remark-directive';
import { tentmanComponents } from './index.js';

const coreFixturesRoot = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	'../../core/src/fixtures/content-components'
);

async function renderMarkdown(source, options = {}) {
	const rendered = await compile(source, {
		filename: options.filename ?? 'component-test.svx',
		remarkPlugins: [
			remarkDirective,
			tentmanComponents({
				componentsDir: options.componentsDir,
				onError: options.onError
			})
		]
	});

	if (typeof rendered?.code !== 'string') {
		throw new Error('Failed to compile markdown');
	}

	return rendered.code;
}

test('renders a valid inline directive through render.njk', async () => {
	const code = await renderMarkdown(':buy-button[Buy tickets]{href="/tickets" variant="secondary"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-inline')
	});

	assert.match(
		code,
		/<a class="buy-button buy-button--secondary" href="\/tickets" data-buy-button data-variant="secondary">Buy tickets<\/a>/
	);
});

test('renders a label-less inline directive through render.njk', async () => {
	const code = await renderMarkdown(':doc-link{href="/docs"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-inline')
	});

	assert.match(code, /<a class="doc-link" href="\/docs">Read more<\/a>/);
});

test('renders a valid block directive through render.njk', async () => {
	const code = await renderMarkdown('::callout-box{title="Latest update" tone="warning"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-block')
	});

	assert.match(code, /Latest update/);
});

test('throws for a missing required directive attribute in strict mode', async () => {
	await assert.rejects(
		renderMarkdown(':buy-button[Buy tickets]', {
			componentsDir: path.join(coreFixturesRoot, 'valid-inline'),
			filename: 'missing-required.svx'
		}),
		/missing-required\.svx:1:1 for component buy-button: Content component attribute href is required/
	);
});

test('throws for an unknown component name in strict mode', async () => {
	await assert.rejects(
		renderMarkdown(':missing-widget[Hello]{href="/x"}', {
			componentsDir: path.join(coreFixturesRoot, 'valid-inline'),
			filename: 'unknown-component.svx'
		}),
		/unknown-component\.svx:1:1 for component missing-widget: Unknown content component name: missing-widget/
	);
});

test('warning mode preserves the original directive source for unknown components', async () => {
	const code = await renderMarkdown(':missing-widget[Hello]{href="/x"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-inline'),
		onError: 'warn',
		filename: 'warn-unknown.svx'
	});

	assert.match(code, /:missing-widget\[Hello\]\{href="\/x"\}/);
});

test('warning mode preserves the original directive source for invalid instances', async () => {
	const code = await renderMarkdown(':buy-button[Buy tickets]{variant="secondary"}', {
		componentsDir: path.join(coreFixturesRoot, 'valid-inline'),
		onError: 'warn',
		filename: 'warn-invalid.svx'
	});

	assert.match(code, /:buy-button\[Buy tickets\]\{variant="secondary"\}/);
});
