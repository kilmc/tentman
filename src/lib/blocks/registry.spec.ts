import { describe, expect, it } from 'vitest';
import { createBlockRegistry } from '$lib/blocks/registry';
import { parseDiscoveredBlockConfig } from '$lib/config/discovery';

describe('createBlockRegistry', () => {
	it('includes built-in blocks and local block configs', () => {
		const registry = createBlockRegistry([
			parseDiscoveredBlockConfig(
				'tentman/blocks/seo.tentman.json',
				`{
					"type": "block",
					"id": "seo",
					"label": "SEO",
					"blocks": [
						{ "id": "metaTitle", "type": "text", "label": "Meta Title" }
					]
				}`
			)
		]);

		expect(registry.has('text')).toBe(true);
		expect(registry.has('seo')).toBe(true);
		expect(registry.get('seo')).toMatchObject({
			id: 'seo',
			kind: 'local',
			path: 'tentman/blocks/seo.tentman.json'
		});
		expect(registry.getAdapter('text')?.getDefaultValue({ id: 'title', type: 'text' })).toBe('');
		expect(registry.getAdapter('seo')?.getDefaultValue({ id: 'seo', type: 'seo' })).toEqual({
			metaTitle: ''
		});
	});

	it('fails fast when local block ids duplicate each other', () => {
		expect(() =>
			createBlockRegistry([
				parseDiscoveredBlockConfig(
					'tentman/blocks/seo.tentman.json',
					`{
						"type": "block",
						"id": "seo",
						"label": "SEO",
						"blocks": [{ "id": "metaTitle", "type": "text" }]
					}`
				),
				parseDiscoveredBlockConfig(
					'tentman/blocks/marketing/seo.tentman.json',
					`{
						"type": "block",
						"id": "seo",
						"label": "Marketing SEO",
						"blocks": [{ "id": "metaDescription", "type": "text" }]
					}`
				)
			])
		).toThrow(/Duplicate block id "seo"/);
	});

	it('fails fast when a local block reuses a built-in id', () => {
		expect(() =>
			createBlockRegistry([
				parseDiscoveredBlockConfig(
					'tentman/blocks/text.tentman.json',
					`{
						"type": "block",
						"id": "text",
						"label": "Custom Text",
						"blocks": [{ "id": "value", "type": "text" }]
					}`
				)
			])
		).toThrow(/Duplicate block id "text"/);
	});
});
