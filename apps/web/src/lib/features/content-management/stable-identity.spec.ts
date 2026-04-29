import { describe, expect, it } from 'vitest';
import type { ParsedContentConfig } from '$lib/config/parse';
import {
	hasGeneratedTentmanId,
	normalizeRuntimeCollectionItemIds,
	normalizeRuntimeDiscoveredConfigIdentity
} from './stable-identity';

const manualCollectionConfig: ParsedContentConfig = {
	type: 'content',
	label: 'Projects',
	itemLabel: 'Project',
	collection: {
		sorting: 'manual',
		groups: [{ label: 'Identity', slug: 'identity' }]
	},
	idField: 'slug',
	content: {
		mode: 'directory',
		path: './projects',
		template: './project.md'
	},
	blocks: [
		{ id: 'title', type: 'text', label: 'Title' },
		{ id: 'slug', type: 'text', label: 'Slug' }
	]
};

describe('stable identity runtime normalization', () => {
	it('normalizes runtime config and group ids for manual navigation configs', () => {
		const [config] = normalizeRuntimeDiscoveredConfigIdentity(
			[
				{
					slug: 'projects',
					path: 'tentman/configs/projects.tentman.json',
					config: manualCollectionConfig
				}
			],
			{ content: { sorting: 'manual' } }
		);

		expect(config.config._tentmanId).toBe('projects');
		expect(hasGeneratedTentmanId(config.config)).toBe(true);
		expect(config.config.collection).toMatchObject({
			groups: [{ _tentmanId: 'identity', label: 'Identity', slug: 'identity' }]
		});
	});

	it('normalizes runtime item ids for manual collections without mutating persisted source shape', () => {
		const items = normalizeRuntimeCollectionItemIds(manualCollectionConfig, [
			{ title: 'Berlin Neukolln Kiezkulisse', slug: 'berlin-neukoelln-kiezkulisse' },
			{ title: 'Second Project', _filename: 'second-project.md' },
			{ title: 'Second Project Duplicate', _filename: 'second-project.md' }
		]);

		expect(items.map((item) => item._tentmanId)).toEqual([
			'berlin-neukoelln-kiezkulisse',
			'second-project',
			'second-project-2'
		]);
		expect(items.every((item) => hasGeneratedTentmanId(item))).toBe(true);
	});
});
