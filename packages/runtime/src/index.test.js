import assert from 'node:assert/strict';
import test from 'node:test';
import {
	getNavigationCollection,
	getNavigationGroupDefinition,
	getNavigationGroupDefinitions,
	getNavigationGroupLabel,
	getNavigationGroupValue,
	parseNavigationManifest
} from './index.js';

test('parses navigation manifests with Tentman group values', () => {
	const manifest = parseNavigationManifest(`{
		"version": 1,
		"collections": {
			"projects": {
				"id": "projects",
				"configId": "projects",
				"items": [],
				"groups": [
					{
						"id": "tent_group_identity",
						"label": "Identity",
						"value": "identity",
						"items": []
					}
				]
			}
		}
	}`);

	assert.deepEqual(manifest.collections.projects.groups[0], {
		id: 'tent_group_identity',
		label: 'Identity',
		value: 'identity',
		items: []
	});
});

test('resolves collection and group helpers from the manifest', () => {
	const manifest = {
		version: 1,
		collections: {
			tent_projects: {
				id: 'tent_projects',
				configId: 'projects',
				slug: 'projects',
				items: [],
				groups: [
					{
						id: 'tent_group_identity',
						label: 'Identity',
						value: 'identity',
						items: []
					}
				]
			}
		}
	};

	assert.equal(getNavigationCollection(manifest, 'projects')?.id, 'tent_projects');
	assert.deepEqual(getNavigationGroupDefinitions(manifest, 'projects'), [
		{
			id: 'tent_group_identity',
			label: 'Identity',
			value: 'identity',
			items: []
		}
	]);
	assert.deepEqual(getNavigationGroupDefinition(manifest, 'projects', 'tent_group_identity'), {
		id: 'tent_group_identity',
		label: 'Identity',
		value: 'identity',
		items: []
	});
	assert.equal(getNavigationGroupLabel(manifest, 'projects', 'tent_group_identity'), 'Identity');
	assert.equal(getNavigationGroupValue(manifest, 'projects', 'tent_group_identity'), 'identity');
});
