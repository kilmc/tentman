import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNavigationManifest, serializeNavigationManifest } from './manifest.js';

test('parses the current navigation manifest shape', () => {
	const manifest = parseNavigationManifest(`{
		"version": 1,
		"content": { "items": ["about"] },
		"collections": {
			"blog": {
				"items": ["hello-world"],
				"groups": [{ "id": "featured", "label": "Featured", "items": ["hello-world"] }]
			}
		}
	}`);

	assert.deepEqual(manifest.content.items, [{ id: 'about' }]);
	assert.deepEqual(manifest.collections.blog.groups[0], {
		id: 'featured',
		label: 'Featured',
		items: [{ id: 'hello-world' }]
	});
});

test('parses richer materialized navigation entries', () => {
	const manifest = parseNavigationManifest(`{
		"version": 1,
		"content": {
			"items": [{ "id": "about", "label": "About", "slug": "about" }]
		},
		"collections": {
			"blog": {
				"id": "blog",
				"label": "Blog",
				"slug": "blog",
				"items": [{ "id": "hello-world", "label": "Hello world", "slug": "hello-world" }]
			}
		}
	}`);

	assert.deepEqual(manifest.content.items, [{ id: 'about', label: 'About', slug: 'about' }]);
	assert.deepEqual(manifest.collections.blog, {
		id: 'blog',
		label: 'Blog',
		slug: 'blog',
		items: [{ id: 'hello-world', label: 'Hello world', slug: 'hello-world' }]
	});
});

test('rejects unsupported manifest versions', () => {
	assert.throws(() => parseNavigationManifest('{"version":2}'), /version must be 1/);
});

test('serializes manifests with tabs and a trailing newline', () => {
	assert.equal(serializeNavigationManifest({ version: 1 }), '{\n\t"version": 1\n}\n');
});
