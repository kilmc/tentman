import assert from 'node:assert/strict';
import test from 'node:test';
import { explainTentmanNavigation, loadTentmanProject } from './index.js';
import { testAppRoot } from './test-paths.test-helper.js';

test('explains top-level config navigation position', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const explanation = explainTentmanNavigation(project, 'contact');

	assert.deepEqual(explanation, {
		config: {
			label: 'Contact Page',
			reference: 'tent_01KQD7Q1301SNN4W42XV2XYA17',
			path: 'tentman/configs/contact.tentman.json',
			topLevelIndex: 0,
			topLevelSource: 'manifest',
			topLevelMatchedReference: 'tent_01KQD7Q1301SNN4W42XV2XYA17'
		}
	});
});

test('explains collection item navigation position and manifest group membership', async () => {
	const project = await loadTentmanProject(testAppRoot);
	const explanation = explainTentmanNavigation(project, 'blog', 'testing-content-workflows');

	assert.deepEqual(explanation, {
		config: {
			label: 'Blog Posts',
			reference: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07',
			path: 'tentman/configs/blog.tentman.json',
			topLevelIndex: 2,
			topLevelSource: 'manifest',
			topLevelMatchedReference: 'tent_01KQD7Q12YAMHFJ3FWHBQ16Z07'
		},
		item: {
			label: 'Testing the new content workflows',
			reference: 'tent_01KQD7Q12ZHBTXG669982DV00K',
			path: 'src/content/posts/testing-content-workflows.md',
			index: 0,
			orderSource: 'manifest',
			matchedReference: 'tent_01KQD7Q12ZHBTXG669982DV00K',
			group: {
				id: 'featured',
				label: 'Featured posts',
				index: 0
			}
		}
	});
});

test('throws when explaining an unknown collection item reference', async () => {
	const project = await loadTentmanProject(testAppRoot);

	assert.throws(
		() => explainTentmanNavigation(project, 'blog', 'missing-item'),
		/Unknown item reference for Blog Posts: missing-item/
	);
});
