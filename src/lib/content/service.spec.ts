import { describe, expect, it } from 'vitest';
import { isParsedContentConfig, parseConfigFile } from '$lib/config/parse';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';
import {
	createContentDocument,
	deleteContentDocument,
	fetchContentDocument,
	previewContentChanges,
	saveContentDocument
} from './service';

class MemoryRepositoryBackend implements RepositoryBackend {
	kind = 'local' as const;
	cacheKey = 'memory';
	label = 'Memory';
	supportsDraftBranches = false;
	files = new Map<string, string>();
	writes: Array<{ path: string; content: string; options?: RepositoryWriteOptions }> = [];
	deletes: Array<{ path: string; options?: RepositoryWriteOptions }> = [];

	constructor(initialFiles: Record<string, string>) {
		for (const [path, content] of Object.entries(initialFiles)) {
			this.files.set(path, content);
		}
	}

	async discoverConfigs() {
		return [];
	}

	async discoverBlockConfigs() {
		return [];
	}

	async readRootConfig() {
		return null;
	}

	async readTextFile(path: string, _options?: RepositoryReadOptions): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) {
			throw new Error(`File not found: ${path}`);
		}

		return content;
	}

	async writeTextFile(
		path: string,
		content: string,
		options?: RepositoryWriteOptions
	): Promise<void> {
		this.files.set(path, content);
		this.writes.push({ path, content, options });
	}

	async deleteFile(path: string, options?: RepositoryWriteOptions): Promise<void> {
		this.files.delete(path);
		this.deletes.push({ path, options });
	}

	async listDirectory(
		path: string
	): Promise<{ name: string; path: string; kind: 'file' | 'directory' }[]> {
		const prefix = path ? `${path}/` : '';
		const entries = new Map<string, { name: string; path: string; kind: 'file' | 'directory' }>();

		for (const filePath of this.files.keys()) {
			if (path && filePath !== path && !filePath.startsWith(prefix)) {
				continue;
			}

			const relativePath = prefix ? filePath.slice(prefix.length) : filePath;
			if (!relativePath || relativePath.includes('/')) {
				continue;
			}

			entries.set(filePath, {
				name: relativePath,
				path: filePath,
				kind: 'file'
			});
		}

		return Array.from(entries.values());
	}

	async fileExists(path: string): Promise<boolean> {
		return this.files.has(path);
	}
}

function parseContentConfigFixture(content: string) {
	const parsed = parseConfigFile(content);

	if (!isParsedContentConfig(parsed)) {
		throw new Error('Expected a parsed content config fixture');
	}

	return parsed;
}

const singletonConfig = parseContentConfigFixture(
	JSON.stringify({
		type: 'content',
		label: 'Site Settings',
		content: {
			mode: 'file',
			path: './site.json'
		},
		blocks: [{ id: 'title', type: 'text', label: 'Title' }]
	})
);

const arrayConfig = parseContentConfigFixture(
	JSON.stringify({
		type: 'content',
		label: 'Team',
		itemLabel: 'Member',
		collection: true,
		idField: 'slug',
		content: {
			mode: 'file',
			path: './team.json',
			itemsPath: '$.members'
		},
		blocks: [
			{ id: 'slug', type: 'text', label: 'Slug' },
			{ id: 'name', type: 'text', label: 'Name' }
		]
	})
);

const generatedIdArrayConfig = parseContentConfigFixture(
	JSON.stringify({
		type: 'content',
		label: 'Team',
		itemLabel: 'Member',
		collection: true,
		idField: 'slug',
		content: {
			mode: 'file',
			path: './team-generated.json',
			itemsPath: '$.members'
		},
		blocks: [
			{ id: 'slug', type: 'text', label: 'Slug', generated: true },
			{ id: 'name', type: 'text', label: 'Name' }
		]
	})
);

const directoryConfig = parseContentConfigFixture(
	JSON.stringify({
		type: 'content',
		label: 'Posts',
		itemLabel: 'Post',
		collection: true,
		idField: 'slug',
		content: {
			mode: 'directory',
			path: './posts',
			template: './templates/post.md'
		},
		blocks: [
			{ id: 'slug', type: 'text', label: 'Slug' },
			{ id: 'title', type: 'text', label: 'Title' }
		]
	})
);

describe('content/service', () => {
	it('fetches and saves file-mode singleton content through the service', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/site.json': '{\n  "title": "Before"\n}\n'
		});

		const fetched = await fetchContentDocument(
			backend,
			singletonConfig,
			'content/settings.tentman.json'
		);
		expect(fetched).toEqual({ title: 'Before' });

		await saveContentDocument(
			backend,
			singletonConfig,
			'content/settings.tentman.json',
			{ title: 'After' },
			{ branch: 'draft/content' }
		);

		expect(backend.files.get('content/site.json')).toBe('{\n  "title": "After"\n}\n');
		expect(backend.writes.at(-1)?.options?.ref).toBe('draft/content');
	});

	it('updates file-mode collections via itemsPath', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/team.json':
				'{\n  "members": [\n    { "slug": "alice", "name": "Alice" },\n    { "slug": "bob", "name": "Bob" }\n  ]\n}\n'
		});

		const fetched = await fetchContentDocument(backend, arrayConfig, 'content/team.tentman.json');
		expect(fetched).toEqual([
			{ slug: 'alice', name: 'Alice' },
			{ slug: 'bob', name: 'Bob' }
		]);

		await saveContentDocument(
			backend,
			arrayConfig,
			'content/team.tentman.json',
			{ slug: 'bob', name: 'Robert' },
			{ itemId: 'bob' }
		);

		await createContentDocument(backend, arrayConfig, 'content/team.tentman.json', {
			slug: 'carol',
			name: 'Carol'
		});

		await deleteContentDocument(backend, arrayConfig, 'content/team.tentman.json', {
			itemId: 'alice'
		});

		expect(JSON.parse(backend.files.get('content/team.json') ?? '{}')).toEqual({
			members: [
				{ slug: 'bob', name: 'Robert' },
				{ slug: 'carol', name: 'Carol' }
			]
		});
	});

	it('assigns generated ids for file-mode collection creates from block metadata', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/team-generated.json': '{\n  "members": []\n}\n'
		});

		await createContentDocument(
			backend,
			generatedIdArrayConfig,
			'content/team-generated.tentman.json',
			{ name: 'Carol' }
		);

		const saved = JSON.parse(backend.files.get('content/team-generated.json') ?? '{}') as {
			members: Array<{ slug?: string; name: string }>;
		};

		expect(saved.members).toHaveLength(1);
		expect(saved.members[0]).toMatchObject({ name: 'Carol' });
		expect(saved.members[0]?.slug).toMatch(/^\d+-[a-z0-9]+$/);
	});

	it('uses content.path for directory-mode fetch and write operations', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/posts/hello-world.md': '---\nslug: hello-world\ntitle: Hello World\n---\nBody copy',
			'content/posts/_draft.md': 'ignore me',
			'content/templates/post.md': '---\nslug: "{{slug}}"\ntitle: "{{title}}"\n---\nTemplate body'
		});

		const fetched = await fetchContentDocument(
			backend,
			directoryConfig,
			'content/posts.tentman.json'
		);
		expect(fetched).toEqual([
			{
				slug: 'hello-world',
				title: 'Hello World',
				_body: 'Body copy',
				_filename: 'hello-world.md'
			}
		]);

		await createContentDocument(
			backend,
			directoryConfig,
			'content/posts.tentman.json',
			{ slug: 'new-post', title: 'New Post', _body: 'Fresh body' },
			{ filename: 'new-post' }
		);

		await saveContentDocument(
			backend,
			directoryConfig,
			'content/posts.tentman.json',
			{ slug: 'hello-world', title: 'Updated Title', _body: 'Updated body' },
			{ filename: 'hello-world.md', newFilename: 'renamed-post' }
		);

		await deleteContentDocument(backend, directoryConfig, 'content/posts.tentman.json', {
			filename: 'new-post.md'
		});

		expect(backend.files.get('content/posts/renamed-post.md')).toContain('Updated Title');
		expect(backend.files.has('content/posts/hello-world.md')).toBe(false);
		expect(backend.files.has('content/posts/new-post.md')).toBe(false);
		expect(backend.files.has('content/templates/renamed-post.md')).toBe(false);
	});

	it('previews file-mode collection updates through the service', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/team.json': '{\n  "members": [\n    { "slug": "alice", "name": "Alice" }\n  ]\n}\n'
		});

		const changes = await previewContentChanges(
			backend,
			arrayConfig,
			'content/team.tentman.json',
			{ slug: 'alice', name: 'Alicia' },
			{ itemId: 'alice' }
		);

		expect(changes.totalChanges).toBe(1);
		expect(changes.files[0]).toMatchObject({
			path: 'content/team.json',
			type: 'update'
		});
		expect(changes.files[0].newContent).toContain('Alicia');
	});

	it('previews directory-mode creates using content.path and template output', async () => {
		const backend = new MemoryRepositoryBackend({
			'content/templates/post.md':
				'---\nslug: "{{slug}}"\ntitle: "{{title}}"\nlayout: post\n---\nTemplate for {{title}}'
		});

		const changes = await previewContentChanges(
			backend,
			directoryConfig,
			'content/posts.tentman.json',
			{ slug: 'preview-post', title: 'Preview Post' },
			{ isNew: true, newFilename: 'preview-post' }
		);

		expect(changes.totalChanges).toBe(1);
		expect(changes.files[0]).toMatchObject({
			path: 'content/posts/preview-post.md',
			type: 'create'
		});
		expect(changes.files[0].newContent).toContain('layout: post');
		expect(changes.files[0].newContent).toContain('Template for Preview Post');
		expect(changes.files[0].path.startsWith('content/templates/')).toBe(false);
	});
});
