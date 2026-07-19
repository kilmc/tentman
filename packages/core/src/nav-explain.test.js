import assert from 'node:assert/strict';
import test from 'node:test';
import { explainTentmanNavigation } from './index.js';
import { loadCoreFixtureProject } from './test-paths.test-helper.js';

test('explains top-level config navigation position', async () => {
	const project = await loadCoreFixtureProject();
	const explanation = explainTentmanNavigation(project, 'contact');

	assert.deepEqual(explanation, {
		config: {
			label: 'Contact',
			reference: 'tent_01KTVA0B0VT000000000000002',
			path: 'tentman/configs/contact.tentman.json',
			topLevelIndex: 2,
			topLevelSource: 'manifest',
			topLevelMatchedReference: 'tent_01KTVA0B0VT000000000000002'
		}
	});
});

test('explains collection item navigation position and manifest group membership', async () => {
	const project = await loadCoreFixtureProject();
	const explanation = explainTentmanNavigation(project, 'blog', 'why-this-test-app-is-so-plain');

	assert.deepEqual(explanation, {
		config: {
			label: 'Blog Posts',
			reference: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07',
			path: 'tentman/configs/blog.tentman.json',
			topLevelIndex: 1,
			topLevelSource: 'manifest',
			topLevelMatchedReference: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07'
		},
		item: {
			label: 'Why this test app is so plain',
			reference: 'tent_01KTVA0B0VT000000000000007',
			path: 'src/content/posts/testing-content-workflows.md',
			index: 3,
			orderSource: 'manifest',
			matchedReference: 'tent_01KTVA0B0VT000000000000007',
			group: null
		}
	});
});

test('throws when explaining an unknown collection item reference', async () => {
	const project = await loadCoreFixtureProject();

	assert.throws(
		() => explainTentmanNavigation(project, 'blog', 'missing-item'),
		/Unknown item reference for Blog Posts: missing-item/
	);
});
