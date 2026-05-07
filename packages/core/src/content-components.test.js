import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import {
	discoverContentComponents,
	loadContentComponent,
	normalizeContentComponentInstance,
	renderContentComponent,
	validateContentComponent
} from './index.js';
import { contentComponentsFixturesRoot } from './test-paths.test-helper.js';

function getFixtureRoot(name) {
	return path.join(contentComponentsFixturesRoot, name);
}

test('loads and validates a content component from disk', async () => {
	const component = validateContentComponent(
		await loadContentComponent(path.join(getFixtureRoot('valid-inline'), 'buy-button'))
	);

	assert.equal(component.definition.id, 'buy-button');
	assert.equal(component.definition.name, 'buy-button');
	assert.equal(component.definition.kind, 'inline');
	assert.deepEqual(component.definition.attributes, {
		href: {
			type: 'string',
			required: true,
			valueFromMarkdownLabel: false
		},
		label: {
			type: 'string',
			required: true,
			valueFromMarkdownLabel: true
		},
		variant: {
			type: 'enum',
			required: false,
			valueFromMarkdownLabel: false,
			default: 'default',
			options: ['default', 'secondary']
		}
	});
	assert.match(component.renderTemplatePath, /render\.njk$/);
	assert.match(component.previewTemplatePath, /preview\.njk$/);
});

test('discovers, normalizes, and renders a buy-button component end to end', async () => {
	const [component] = await discoverContentComponents({
		componentsDir: getFixtureRoot('valid-inline')
	});

	assert.equal(component?.definition.name, 'buy-button');

	const instance = normalizeContentComponentInstance(component, {
		markdownLabel: 'Buy <Tickets>',
		attributes: {
			href: '/tickets?x=<y>',
			variant: 'secondary'
		}
	});

	assert.deepEqual(instance, {
		componentId: 'buy-button',
		componentName: 'buy-button',
		kind: 'inline',
		attributes: {
			href: '/tickets?x=<y>',
			label: 'Buy <Tickets>',
			variant: 'secondary'
		}
	});

	assert.equal(
		renderContentComponent(component, instance, 'render').trim(),
		'<a class="buy-button buy-button--secondary" href="/tickets?x=&lt;y&gt;" data-buy-button data-variant="secondary">Buy &lt;Tickets&gt;</a>'
	);
	assert.equal(
		renderContentComponent(component, instance, 'preview').trim(),
		'<span class="tm-component-preview tm-component-preview--buy-button tm-component-preview--secondary" data-tm-component="buy-button">Buy button: Buy &lt;Tickets&gt;</span>'
	);
});

test('discovers a valid block component', async () => {
	const [component] = await discoverContentComponents({
		componentsDir: getFixtureRoot('valid-block')
	});

	const instance = normalizeContentComponentInstance(component, {
		attributes: {
			title: 'Latest update',
			tone: 'warning'
		}
	});

	assert.equal(component?.definition.kind, 'block');
	assert.deepEqual(instance.attributes, {
		title: 'Latest update',
		tone: 'warning'
	});
});

test('throws when a required template is missing', async () => {
	await assert.rejects(
		discoverContentComponents({
			componentsDir: getFixtureRoot('invalid-missing-template')
		}),
		/Missing required content component file: .*preview\.njk/
	);
});

test('throws when an enum definition is invalid', async () => {
	await assert.rejects(
		discoverContentComponents({
			componentsDir: getFixtureRoot('invalid-enum')
		}),
		/default must match one of the enum options/
	);
});

test('throws when duplicate component ids are discovered', async () => {
	await assert.rejects(
		discoverContentComponents({
			componentsDir: getFixtureRoot('duplicate-ids')
		}),
		/Duplicate content component ids found: duplicate-id/
	);
});

test('throws when duplicate component names are discovered', async () => {
	await assert.rejects(
		discoverContentComponents({
			componentsDir: getFixtureRoot('duplicate-names')
		}),
		/Duplicate content component names found: shared-name/
	);
});

test('normalizes defaults and validates required and enum attributes', async () => {
	const [component] = await discoverContentComponents({
		componentsDir: getFixtureRoot('valid-inline')
	});

	const withDefaults = normalizeContentComponentInstance(component, {
		markdownLabel: 'Buy tickets',
		attributes: {
			href: '/tickets'
		}
	});

	assert.equal(withDefaults.attributes.variant, 'default');

	assert.throws(
		() =>
			normalizeContentComponentInstance(component, {
				markdownLabel: 'Buy tickets'
			}),
		/Content component attribute href is required/
	);
	assert.throws(
		() =>
			normalizeContentComponentInstance(component, {
				markdownLabel: 'Buy tickets',
				attributes: {
					href: '/tickets',
					variant: 'loud'
				}
			}),
		/Content component attribute variant must be one of: default, secondary/
	);
	assert.throws(
		() =>
			normalizeContentComponentInstance(component, {
				markdownLabel: 'Buy tickets',
				attributes: {
					href: '/tickets',
					extra: 'nope'
				}
			}),
		/Unknown content component attribute: extra/
	);
});
