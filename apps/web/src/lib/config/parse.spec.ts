import { describe, expect, it } from 'vitest';
import { normalizeFields } from '$lib/config/fields-compat';
import { parseConfigFile, parseRootConfig } from '$lib/config/parse';

describe('parseConfigFile', () => {
	it('parses content configs in the new explicit schema', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Posts",
			"id": "posts",
			"itemLabel": "Post",
			"collection": true,
			"idField": "slug",
			"content": {
				"mode": "directory",
				"path": "./src/content/posts",
				"template": "./templates/post.md",
				"filename": "{{slug}}"
			},
			"blocks": [
				{ "id": "title", "type": "text", "label": "Title", "required": true, "show": "primary" },
				{ "id": "slug", "type": "text", "label": "Slug", "required": true }
			]
		}`);

		expect(parsed.type).toBe('content');
		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}
		if (parsed.content.mode !== 'directory') {
			throw new Error('Expected directory-backed content config');
		}

		expect(parsed.content.template).toBe('./templates/post.md');
		expect(parsed.content.filename).toBe('{{slug}}');
		expect(parsed.id).toBe('posts');
		expect(normalizeFields(parsed.blocks).title).toMatchObject({
			type: 'text',
			label: 'Title',
			required: true,
			show: 'primary'
		});
		expect(parsed.collection).toEqual(true);
	});

	it('parses manual collection behavior and config-backed groups', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Projects",
			"_tentmanId": "projects",
			"itemLabel": "Project",
			"collection": {
				"sorting": "manual",
				"groups": [
					{ "_tentmanId": "identity", "label": "Identity", "value": "identity" }
				]
			},
			"idField": "slug",
			"content": {
				"mode": "directory",
				"path": "./projects",
				"template": "./project.md"
			},
			"blocks": [
				{ "id": "title", "type": "text", "label": "Title" },
				{ "id": "slug", "type": "text", "label": "Slug" }
			]
		}`);

		if (parsed.type !== 'content' || parsed.collection === true || !parsed.collection) {
			throw new Error('Expected collection behavior config');
		}

		expect(parsed._tentmanId).toBe('projects');
		expect(parsed.collection).toEqual({
			sorting: 'manual',
			groups: [{ _tentmanId: 'identity', label: 'Identity', value: 'identity' }]
		});
	});

	it('parses config and collection state metadata', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Posts",
			"itemLabel": "Post",
			"state": {
				"blockId": "published",
				"preset": "publication",
				"visibility": {
					"card": false
				}
			},
			"collection": {
				"sorting": "manual",
				"state": {
					"blockId": "published",
					"cases": [
						{ "value": false, "label": "Draft", "variant": "warning", "icon": "file-pen" }
					]
				}
			},
			"content": {
				"mode": "directory",
				"path": "./posts",
				"template": "./post.md"
			},
			"blocks": [
				{ "id": "title", "type": "text", "label": "Title" },
				{ "id": "published", "type": "toggle", "label": "Published" }
			]
		}`);

		if (parsed.type !== 'content' || parsed.collection === true || !parsed.collection) {
			throw new Error('Expected collection behavior config');
		}

		expect(parsed.state).toEqual({
			blockId: 'published',
			preset: 'publication',
			visibility: {
				card: false
			}
		});
		expect(parsed.collection.state).toEqual({
			blockId: 'published',
			cases: [{ value: false, label: 'Draft', variant: 'warning', icon: 'file-pen' }]
		});
	});

	it('accepts collection groups before Tentman ids have been repaired', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Projects",
			"itemLabel": "Project",
			"collection": {
				"sorting": "manual",
				"groups": [
					{ "label": "Identity", "value": "identity" }
				]
			},
			"content": {
				"mode": "directory",
				"path": "./projects",
				"template": "./project.md"
			},
			"blocks": [
				{ "id": "title", "type": "text", "label": "Title" }
			]
		}`);

		if (parsed.type !== 'content' || parsed.collection === true || !parsed.collection) {
			throw new Error('Expected collection behavior config');
		}

		expect(parsed.collection).toEqual({
			sorting: 'manual',
			groups: [{ label: 'Identity', value: 'identity' }]
		});
	});

	it('parses block configs in the new explicit schema', () => {
		const parsed = parseConfigFile(`{
			"type": "block",
			"id": "seo",
			"label": "SEO",
			"blocks": [
				{ "id": "metaTitle", "type": "text", "label": "Meta Title" }
			]
		}`);

		expect(parsed.type).toBe('block');
		if (parsed.type !== 'block') {
			throw new Error('Expected block config');
		}

		expect(normalizeFields(parsed.blocks).metaTitle).toMatchObject({
			type: 'text',
			label: 'Meta Title'
		});
	});

	it('parses select blocks with string shorthand options', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Gallery",
			"content": {
				"mode": "file",
				"path": "./gallery.json"
			},
			"blocks": [
				{ "id": "layout", "type": "select", "label": "Layout", "options": ["stack", "inline"] }
			]
		}`);

		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}

		expect(parsed.blocks).toMatchObject([
			{
				id: 'layout',
				type: 'select',
				options: [
					{ value: 'stack', label: 'Stack' },
					{ value: 'inline', label: 'Inline' }
				]
			}
		]);
	});

	it('parses select blocks with explicit option labels', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Gallery",
			"content": {
				"mode": "file",
				"path": "./gallery.json"
			},
			"blocks": [
				{
					"id": "layout",
					"type": "select",
					"label": "Layout",
					"options": [
						{ "value": "stack", "label": "Stack" },
						{ "value": "inline", "label": "Inline row" }
					]
				}
			]
		}`);

		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}

		expect(parsed.blocks[0]).toMatchObject({
			id: 'layout',
			type: 'select',
			options: [
				{ value: 'stack', label: 'Stack' },
				{ value: 'inline', label: 'Inline row' }
			]
		});
	});

	it('parses toggle blocks as built-in primitive fields', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Posts",
			"content": {
				"mode": "file",
				"path": "./posts.json"
			},
			"blocks": [
				{ "id": "published", "type": "toggle", "label": "Published" }
			]
		}`);

		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}

		expect(parsed.blocks[0]).toMatchObject({
			id: 'published',
			type: 'toggle',
			label: 'Published'
		});
	});

	it('parses tentmanGroup blocks', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Projects",
			"id": "projects",
			"itemLabel": "Project",
			"collection": true,
			"idField": "slug",
			"content": {
				"mode": "directory",
				"path": "./projects",
				"template": "./project.md"
			},
			"blocks": [
				{
					"type": "tentmanGroup",
					"label": "Group",
					"required": true,
					"collection": "projects",
					"addOption": true
				}
			]
		}`);

		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}

		expect(parsed.blocks[0]).toMatchObject({
			id: 'tentmanGroup',
			type: 'tentmanGroup',
			collection: 'projects',
			addOption: true
		});
	});

	it('rejects ids on tentmanGroup blocks', () => {
		expect(() =>
			parseConfigFile(`{
				"type": "content",
				"label": "Projects",
				"content": {
					"mode": "file",
					"path": "./projects.json"
				},
				"blocks": [
					{
						"id": "group",
						"type": "tentmanGroup",
						"collection": "projects"
					}
				]
			}`)
		).toThrow(/id is not supported on tentmanGroup blocks/);
	});

	it('rejects missing collection on tentmanGroup blocks', () => {
		expect(() =>
			parseConfigFile(`{
				"type": "content",
				"label": "Projects",
				"content": {
					"mode": "file",
					"path": "./projects.json"
				},
				"blocks": [
					{
						"type": "tentmanGroup"
					}
				]
			}`)
		).toThrow(/collection is required/);
	});

	it('rejects removed Tentman navigation group select syntax', () => {
		expect(() =>
			parseConfigFile(`{
				"type": "content",
				"label": "Projects",
				"content": {
					"mode": "file",
					"path": "./projects.json"
				},
				"blocks": [
					{
						"id": "group",
						"type": "select",
						"options": {
							"source": "tentman.navigationGroups",
							"collection": "projects"
						}
					}
				]
			}`)
		).toThrow(/Replace it with type "tentmanGroup"/);
	});

	it('rejects invalid select option shapes', () => {
		expect(() =>
			parseConfigFile(`{
				"type": "content",
				"label": "Gallery",
				"content": {
					"mode": "file",
					"path": "./gallery.json"
				},
				"blocks": [
					{ "id": "layout", "type": "select", "options": [{ "value": "stack" }] }
				]
			}`)
		).toThrow(/options\[0\]\.label is required/);
	});

	it('rejects options on non-select fields', () => {
		expect(() =>
			parseConfigFile(`{
				"type": "content",
				"label": "Gallery",
				"content": {
					"mode": "file",
					"path": "./gallery.json"
				},
				"blocks": [
					{ "id": "layout", "type": "text", "options": ["stack"] }
				]
			}`)
		).toThrow(/options is only supported on select fields/);
	});

	it('rejects top-level content configs with embedded mode', () => {
		expect(() =>
			parseConfigFile(`{
				"type": "content",
				"label": "Site Settings",
				"content": { "mode": "embedded" },
				"blocks": [
					{ "id": "title", "type": "text" }
				]
			}`)
		).toThrow(/must be "file" or "directory"/);
	});

	it('parses legacy directory-backed configs without an explicit type', () => {
		const parsed = parseConfigFile(`{
			"label": "Blog Posts",
			"template": "./post.template.md",
			"filename": "{{slug}}",
			"fields": [
				{ "property": "title", "label": "Title", "type": "text" },
				{ "property": "slug", "label": "Slug", "type": "text" },
				{ "property": "_body", "label": "Content", "type": "markdown" }
			]
		}`);

		expect(parsed.type).toBe('content');
		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}
		if (parsed.content.mode !== 'directory') {
			throw new Error('Expected directory-backed content config');
		}

		expect(parsed.collection).toBe(true);
		expect(parsed.content.path).toBe('.');
		expect(parsed.content.template).toBe('./post.template.md');
		expect(parsed.idField).toBe('slug');
		expect(parsed.blocks).toMatchObject([
			{ id: 'title', type: 'text', label: 'Title' },
			{ id: 'slug', type: 'text', label: 'Slug' },
			{ id: 'body', type: 'markdown', label: 'Content' }
		]);
	});

	it('parses legacy file-backed configs with nested array fields', () => {
		const parsed = parseConfigFile(`{
			"label": "Contact",
			"contentFile": "./social-links.json",
			"fields": {
				"title": {
					"type": "text",
					"show": "primary"
				},
				"links": {
					"type": "array",
					"fields": {
						"label": "text",
						"url": "url",
						"note": "text"
					}
				}
			}
		}`);

		expect(parsed.type).toBe('content');
		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}
		if (parsed.content.mode !== 'file') {
			throw new Error('Expected file-backed content config');
		}

		expect(parsed.collection).toBe(false);
		expect(parsed.content.path).toBe('./social-links.json');
		expect(parsed.blocks).toMatchObject([
			{ id: 'title', type: 'text', show: 'primary' },
			{
				id: 'links',
				type: 'block',
				collection: true,
				blocks: [
					{ id: 'label', type: 'text' },
					{ id: 'url', type: 'url' },
					{ id: 'note', type: 'text' }
				]
			}
		]);
	});
});

describe('parseRootConfig', () => {
	it('parses root discovery settings', () => {
		const parsed = parseRootConfig(`{
			"siteName": "Field Notes",
			"blocksDir": "./tentman/blocks",
			"configsDir": "./tentman/configs",
			"assetsDir": "./static/images",
			"pluginsDir": "./tentman/plugins",
			"plugins": ["buy-button"],
			"blockPackages": ["@tentman/blocks-media", "@acme/tentman-blocks"],
			"debug": {
				"cacheConfigs": false
			}
		}`);

		expect(parsed).toEqual({
			siteName: 'Field Notes',
			blocksDir: './tentman/blocks',
			configsDir: './tentman/configs',
			assetsDir: './static/images',
			pluginsDir: './tentman/plugins',
			plugins: ['buy-button'],
			blockPackages: ['@tentman/blocks-media', '@acme/tentman-blocks'],
			debug: {
				cacheConfigs: false
			}
		});
	});

	it('parses root manual sorting settings', () => {
		expect(
			parseRootConfig(`{
				"content": {
					"sorting": "manual"
				}
			}`)
		).toEqual({
			content: {
				sorting: 'manual'
			}
		});
	});

	it('parses shared state presets', () => {
		expect(
			parseRootConfig(`{
				"statePresets": {
					"publication": {
						"cases": [
							{ "value": false, "label": "Draft", "variant": "warning", "icon": "file-pen" }
						]
					}
				}
			}`)
		).toEqual({
			statePresets: {
				publication: {
					cases: [
						{ value: false, label: 'Draft', variant: 'warning', icon: 'file-pen' }
					]
				}
			}
		});
	});

	it('parses markdown field plugin allowlists', () => {
		const parsed = parseConfigFile(`{
			"type": "content",
			"label": "Posts",
			"content": {
				"mode": "file",
				"path": "./content/posts.json"
			},
			"blocks": [
				{
					"id": "body",
					"type": "markdown",
					"plugins": ["buy-button"]
				}
			]
		}`);

		if (parsed.type !== 'content') {
			throw new Error('Expected content config');
		}

		expect(parsed.blocks).toMatchObject([
			{
				id: 'body',
				type: 'markdown',
				plugins: ['buy-button']
			}
		]);
	});

	it('rejects field-level plugins on non-markdown fields', () => {
		expect(() =>
			parseConfigFile(`{
				"type": "content",
				"label": "Posts",
				"content": {
					"mode": "file",
					"path": "./content/posts.json"
				},
				"blocks": [
					{
						"id": "title",
						"type": "text",
						"plugins": ["buy-button"]
					}
				]
			}`)
		).toThrow(/only supported on markdown fields/);
	});
});
