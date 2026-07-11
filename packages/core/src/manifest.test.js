import assert from 'node:assert/strict';
import test from 'node:test';
import {
	getNavigationManifestCollection,
	getNavigationManifestGroup,
	getNavigationReferenceId,
	getNavigationReferenceIds,
	normalizeNavigationManifest,
	normalizeNavigationReference,
	parseNavigationManifest,
	serializeNavigationManifest
} from './manifest.js';

test('parses shorthand navigation references into the canonical object shape', () => {
	const manifest = parseNavigationManifest(`{
		"version": 1,
		"content": { "items": ["about"] },
		"collections": {
			"blog": {
				"items": ["hello-world"],
				"groups": [{ "id": "featured", "label": "Featured", "value": "featured", "items": ["hello-world"] }]
			}
		}
	}`);

	assert.deepEqual(manifest.content.items, [{ id: 'about' }]);
	assert.deepEqual(manifest.collections.blog.groups[0], {
		id: 'featured',
		label: 'Featured',
		value: 'featured',
		items: [{ id: 'hello-world' }]
	});
});

test('preserves metadata on materialized navigation references', () => {
	const manifest = parseNavigationManifest(`{
		"version": 1,
		"content": {
			"items": [{ "id": "about", "label": "About", "slug": "about", "href": "/about" }]
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

	assert.deepEqual(manifest.content.items, [
		{ id: 'about', label: 'About', slug: 'about', href: '/about' }
	]);
	assert.deepEqual(manifest.collections.blog, {
		id: 'blog',
		label: 'Blog',
		slug: 'blog',
		items: [{ id: 'hello-world', label: 'Hello world', slug: 'hello-world' }]
	});
});

test('rejects malformed manifest structure and references with contextual errors', () => {
	assert.throws(
		() => parseNavigationManifest('{"version":2}'),
		/navigation manifest version must be 1/
	);
	assert.throws(() => parseNavigationManifest('[]'), /navigation manifest must be an object/);
	assert.throws(
		() => parseNavigationManifest('{"version":1,"content":[]}'),
		/navigation manifest content must be an object/
	);
	assert.throws(
		() => parseNavigationManifest('{"version":1,"content":{"items":[{"label":"Missing id"}]}}'),
		/navigation manifest content.items\[0\].id must be a non-empty string/
	);
	assert.throws(
		() =>
			parseNavigationManifest(
				'{"version":1,"collections":{"blog":{"groups":[{"id":"featured","label":12}]}}}'
			),
		/navigation manifest collections.blog.groups\[0\].label must be a non-empty string when present/
	);
});

test('serializes the canonical navigation reference object shape', () => {
	assert.equal(
		serializeNavigationManifest({
			version: 1,
			content: {
				items: ['about']
			},
			collections: {
				blog: {
					items: ['hello-world'],
					groups: [{ id: 'featured', items: ['hello-world'] }]
				}
			}
		}),
		`{
	"version": 1,
	"content": {
		"items": [
			{
				"id": "about"
			}
		]
	},
	"collections": {
		"blog": {
			"items": [
				{
					"id": "hello-world"
				}
			],
			"groups": [
				{
					"id": "featured",
					"items": [
						{
							"id": "hello-world"
						}
					]
				}
			]
		}
	}
}
`
	);
});

test('normalizes references and extracts ids from shorthand and canonical references', () => {
	assert.deepEqual(normalizeNavigationReference('about'), { id: 'about' });
	assert.deepEqual(normalizeNavigationReference({ id: 'about', label: 'About' }), {
		id: 'about',
		label: 'About'
	});
	assert.equal(getNavigationReferenceId('about'), 'about');
	assert.equal(getNavigationReferenceId({ id: 'about', label: 'About' }), 'about');
	assert.deepEqual(getNavigationReferenceIds(['about', { id: 'blog' }, { label: 'Missing id' }]), [
		'about',
		'blog'
	]);
});

test('normalizes manifest objects without going through JSON parsing', () => {
	assert.deepEqual(
		normalizeNavigationManifest({
			version: 1,
			content: { items: ['about'] }
		}),
		{
			version: 1,
			content: { items: [{ id: 'about' }] }
		}
	);
});

test('looks up collections and groups by supported references', () => {
	const manifest = parseNavigationManifest(`{
		"version": 1,
		"collections": {
			"blog": {
				"id": "tent_blog",
				"configId": "posts",
				"slug": "writing",
				"items": [],
				"groups": [{ "id": "featured", "value": "featured-posts", "items": [] }]
			}
		}
	}`);

	assert.equal(getNavigationManifestCollection(manifest, 'blog'), manifest.collections.blog);
	assert.equal(getNavigationManifestCollection(manifest, 'tent_blog'), manifest.collections.blog);
	assert.equal(getNavigationManifestCollection(manifest, 'posts'), manifest.collections.blog);
	assert.equal(
		getNavigationManifestCollection(manifest, { id: 'writing' }),
		manifest.collections.blog
	);
	assert.equal(getNavigationManifestCollection(manifest, 'missing'), null);

	assert.equal(
		getNavigationManifestGroup(manifest.collections.blog, 'featured-posts'),
		manifest.collections.blog.groups[0]
	);
	assert.equal(
		getNavigationManifestGroup(manifest.collections.blog, { id: 'featured' }),
		manifest.collections.blog.groups[0]
	);
	assert.equal(getNavigationManifestGroup(manifest.collections.blog, 'missing'), null);
});

test('navigation manifest subpath exposes the canonical API', async () => {
	const api = await import('@tentman/core/navigation-manifest');

	assert.equal(typeof api.parseNavigationManifest, 'function');
	assert.deepEqual(api.parseNavigationManifest('{"version":1,"content":{"items":["about"]}}'), {
		version: 1,
		content: { items: [{ id: 'about' }] }
	});
});
