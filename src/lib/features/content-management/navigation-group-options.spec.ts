import { describe, expect, it } from 'vitest';
import {
	addCollectionGroupToConfigSource,
	addNavigationGroupToManifest,
	getSelectOptionsFromNavigationGroups,
	slugifyNavigationGroupLabel
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
								{ id: 'identity', label: 'Identity', items: ['project-one'] },
								{ id: 'archive', label: '', items: [] }
							]
						}
					}
				},
				'projects'
			)
		).toEqual([
			{ value: 'identity', label: 'Identity' },
			{ value: 'archive', label: 'archive' }
		]);
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
					projects: {
						items: ['one'],
						groups: [{ id: 'old', label: 'Old', items: ['one'] }]
					}
				}
			},
			{
				collection: 'projects',
				id: 'new-work',
				label: 'New Work'
			}
		);

		expect(manifest.collections?.projects).toEqual({
			items: ['one'],
			groups: [
				{ id: 'old', label: 'Old', items: ['one'] },
				{ id: 'new-work', label: 'New Work', items: [] }
			]
		});
	});

	it('creates the manifest and collection shape when no manifest exists', () => {
		expect(
			addNavigationGroupToManifest(null, {
				collection: 'projects',
				id: 'new-work',
				label: 'New Work'
			})
		).toEqual({
			version: 1,
			collections: {
				projects: {
					items: [],
					groups: [{ id: 'new-work', label: 'New Work', items: [] }]
				}
			}
		});
	});

	it('prevents duplicate group ids in the same collection', () => {
		expect(() =>
			addNavigationGroupToManifest(
				{
					version: 1,
					collections: {
						projects: {
							items: [],
							groups: [{ id: 'identity', label: 'Identity', items: [] }]
						}
					}
				},
				{
					collection: 'projects',
					id: 'identity',
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
					groups: [{ _tentmanId: 'old-group', label: 'Old', slug: 'old' }]
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
				id: 'new-work',
				label: 'New Work'
			}
		);

		expect(nextSource).toContain('"slug": "new-work"');
		expect(nextSource).toContain('"label": "New Work"');
	});

	it('derives editable group ids from labels', () => {
		expect(slugifyNavigationGroupLabel('Identity & Motion')).toBe('identity-motion');
	});
});
