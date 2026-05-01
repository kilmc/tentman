import { describe, expect, it } from 'vitest';
import {
	addCollectionGroupToConfigSource,
	addNavigationGroupToManifest,
	deriveNavigationGroupValue,
	getSelectOptionsFromNavigationGroups
} from '$lib/features/content-management/navigation-group-options';

describe('navigation group select options', () => {
	it('renders select options from navigation manifest groups', () => {
		expect(
			getSelectOptionsFromNavigationGroups(
				{
					version: 1,
					collections: {
						projects: {
							items: ['project-one'],
							groups: [
								{
									id: 'tent_group_identity',
									value: 'identity',
									label: 'Identity',
									items: ['project-one']
								},
								{ id: 'archive', label: '', items: [] }
							]
						}
					}
				},
				'projects'
			)
		).toEqual([
			{ value: 'tent_group_identity', label: 'Identity' },
			{ value: 'archive', label: 'archive' }
		]);
	});

	it('resolves collection options by authored config id when the manifest is keyed by Tentman id', () => {
		expect(
			getSelectOptionsFromNavigationGroups(
				{
					version: 1,
					collections: {
						tent_01PROJECTS: {
							id: 'tent_01PROJECTS',
							slug: 'projects',
							configId: 'project-collection',
							items: ['project-one'],
							groups: [
								{
									id: 'tent_group_identity',
									value: 'identity',
									label: 'Identity',
									items: ['project-one']
								}
							]
						}
					}
				},
				'project-collection'
			)
		).toEqual([{ value: 'tent_group_identity', label: 'Identity' }]);
	});

	it('returns no options when the navigation manifest or collection groups are missing', () => {
		expect(getSelectOptionsFromNavigationGroups(null, 'projects')).toEqual([]);
		expect(
			getSelectOptionsFromNavigationGroups({ version: 1, collections: {} }, 'projects')
		).toEqual([]);
	});

	it('adds a new group to an existing collection', () => {
		const manifest = addNavigationGroupToManifest(
			{
				version: 1,
				content: { items: ['projects'] },
				collections: {
					tent_01PROJECTS: {
						id: 'tent_01PROJECTS',
						slug: 'projects',
						configId: 'project-collection',
						items: ['one'],
						groups: [{ id: 'old', label: 'Old', value: 'old', items: ['one'] }]
					}
				}
			},
			{
				collection: 'project-collection',
				id: 'tent_group_new_work',
				value: 'new-work',
				label: 'New Work'
			}
		);

		expect(manifest.collections?.tent_01PROJECTS).toEqual({
			id: 'tent_01PROJECTS',
			slug: 'projects',
			configId: 'project-collection',
			items: ['one'],
			groups: [
				{ id: 'old', label: 'Old', value: 'old', items: ['one'] },
				{ id: 'tent_group_new_work', label: 'New Work', value: 'new-work', items: [] }
			]
		});
	});

	it('creates the manifest and collection shape when no manifest exists', () => {
		expect(
			addNavigationGroupToManifest(null, {
				collection: 'project-collection',
				id: 'tent_group_new_work',
				value: 'new-work',
				label: 'New Work'
			})
		).toEqual({
			version: 1,
			collections: {
				'project-collection': {
					items: [],
					groups: [
						{ id: 'tent_group_new_work', label: 'New Work', value: 'new-work', items: [] }
					]
				}
			}
		});
	});

	it('prevents duplicate group values in the same collection', () => {
		expect(() =>
			addNavigationGroupToManifest(
				{
					version: 1,
					collections: {
						tent_01PROJECTS: {
							configId: 'project-collection',
							items: [],
							groups: [
								{ id: 'tent_group_identity', label: 'Identity', value: 'identity', items: [] }
							]
						}
					}
				},
				{
					collection: 'project-collection',
					id: 'tent_group_identity_2',
					value: 'identity',
					label: 'Identity again'
				}
			)
		).toThrow(/already exists/);
	});

	it('writes a new config-backed collection group definition', () => {
		const nextSource = addCollectionGroupToConfigSource(
			JSON.stringify({
				type: 'content',
				label: 'Projects',
				collection: {
					sorting: 'manual',
					groups: [{ _tentmanId: 'old-group', label: 'Old', value: 'old' }]
				},
				content: {
					mode: 'directory',
					path: './projects',
					template: './project.md'
				},
				blocks: []
			}),
			{
				collection: 'projects',
				id: 'tent_group_new_work',
				value: 'new-work',
				label: 'New Work'
			}
		);

		expect(nextSource).toContain('"value": "new-work"');
		expect(nextSource).toContain('"label": "New Work"');
	});

	it('derives editable group values from labels', () => {
		expect(deriveNavigationGroupValue('Identity & Motion')).toBe('identity-motion');
	});
});
