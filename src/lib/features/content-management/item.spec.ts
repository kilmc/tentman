import { describe, expect, it } from 'vitest';
import { formatContentValue, getContentItemId } from './item';
import type { Config } from '$lib/types/config';

const arrayConfig: Config = {
	label: 'Posts',
	contentFile: 'posts.json',
	collectionPath: '$.posts',
	idField: 'slug',
	fields: {
		title: 'text',
		slug: 'text'
	}
};

const collectionConfig: Config = {
	label: 'Posts',
	template: './post.md',
	idField: 'slug',
	fields: {
		title: 'text',
		slug: 'text'
	}
};

describe('content-management/item', () => {
	it('resolves item ids for array content', () => {
		expect(getContentItemId('array', arrayConfig, { slug: 'hello-world' })).toBe('hello-world');
	});

	it('resolves item ids for collection content from filenames', () => {
		expect(getContentItemId('collection', collectionConfig, { _filename: 'hello-world.md' })).toBe(
			'hello-world'
		);
	});

	it('formats display values consistently', () => {
		expect(formatContentValue(true)).toBe('Yes');
		expect(formatContentValue(['a', 'b'])).toBe('[2 items]');
		expect(formatContentValue('2026-03-18')).toContain('2026');
	});
});
