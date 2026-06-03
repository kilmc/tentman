import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubRepositoryBackend } from '$lib/repository/github';
import type { RepositoryBackend } from '$lib/repository/types';
import {
	clearRepositorySnapshotCache,
	clearSingletonConfigStateCache,
	getSingletonConfigStates
} from './index';

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	loadNavigationManifestState: vi.fn(async () => ({
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	}))
}));

function encodeBlob(value: string): string {
	return Buffer.from(value, 'utf-8').toString('base64');
}

function createBaseBackend(overrides: Partial<RepositoryBackend> = {}): RepositoryBackend {
	return {
		kind: 'github',
		cacheKey: 'github:acme/docs?ref=main',
		label: 'acme/docs',
		supportsDraftBranches: true,
		discoverConfigs: vi.fn(async () => []),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null),
		readTextFile: vi.fn(async () => ''),
		writeTextFile: vi.fn(async () => undefined),
		writeBinaryFile: vi.fn(async () => undefined),
		deleteFile: vi.fn(async () => undefined),
		listDirectory: vi.fn(async () => []),
		fileExists: vi.fn(async () => false),
		...overrides
	};
}

function createGitHubBackend(files: Record<string, string>): GitHubRepositoryBackend {
	const shasByPath = new Map(Object.keys(files).map((path) => [path, `sha:${path}`]));
	const contentBySha = new Map(
		Object.entries(files).map(([path, content]) => [`sha:${path}`, content])
	);
	const octokit = {
		rest: {
			repos: {
				getBranch: vi.fn(async () => ({
					data: {
						commit: {
							sha: 'commit-main'
						}
					}
				}))
			},
			git: {
				getCommit: vi.fn(async () => ({
					data: {
						tree: {
							sha: 'tree-main'
						}
					}
				})),
				getTree: vi.fn(async () => ({
					data: {
						truncated: false,
						tree: [...shasByPath.entries()].map(([path, sha]) => ({
							path,
							sha,
							type: 'blob',
							size: contentBySha.get(sha)?.length
						}))
					}
				})),
				getBlob: vi.fn(async ({ file_sha }: { file_sha: string }) => ({
					data: {
						content: encodeBlob(contentBySha.get(file_sha) ?? '')
					}
				}))
			}
		}
	};

	return {
		...(createBaseBackend({
			readTextFile: vi.fn(async () => {
				throw new Error('legacy text reads should not run');
			})
		}) as GitHubRepositoryBackend),
		owner: 'acme',
		repo: 'docs',
		fullName: 'acme/docs',
		octokit: octokit as never
	};
}

describe('singleton config states repository data layer', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
		clearSingletonConfigStateCache();
	});

	it('resolves GitHub singleton states from tree blob identity', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"statePresets": {
					"publishing": {
						"cases": [
							{ "value": false, "label": "Draft", "variant": "warning", "icon": "file-pen" },
							{ "value": true, "label": "Published", "variant": "success" }
						]
					}
				}
			}`,
			'tentman/configs/about.tentman.json': `{
				"type": "content",
				"label": "About",
				"state": {
					"blockId": "published",
					"preset": "publishing"
				},
				"content": {
					"mode": "file",
					"path": "../../src/content/about.md"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" },
					{ "id": "published", "type": "checkbox", "label": "Published" }
				]
			}`,
			'tentman/configs/posts.tentman.json': `{
				"type": "content",
				"label": "Posts",
				"collection": true,
				"state": {
					"blockId": "published",
					"cases": [{ "value": false, "label": "Draft" }]
				},
				"content": {
					"mode": "directory",
					"path": "../../src/content/posts",
					"template": "../../src/content/posts/_template.md"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" }
				]
			}`,
			'src/content/about.md': `---\ntitle: "About"\npublished: false\n---\nBody`,
			'src/content/posts/hello.md': `---\ntitle: "Hello"\npublished: false\n---\nBody`
		});

		const states = await getSingletonConfigStates({ backend });

		expect(states).toEqual({
			about: {
				value: false,
				label: 'Draft',
				variant: 'warning',
				icon: 'file-pen',
				visibility: {
					navigation: true,
					header: true,
					card: true
				}
			}
		});
		expect(backend.readTextFile).not.toHaveBeenCalled();
		expect(backend.octokit.rest.git.getBlob).toHaveBeenCalledWith(
			expect.objectContaining({
				file_sha: 'sha:src/content/about.md'
			})
		);
		expect(backend.octokit.rest.git.getBlob).not.toHaveBeenCalledWith(
			expect.objectContaining({
				file_sha: 'sha:src/content/posts/hello.md'
			})
		);
	});

	it('returns null for incomplete backends so callers can use legacy fallback', async () => {
		const backend = createBaseBackend({ kind: 'local' });

		await expect(getSingletonConfigStates({ backend })).resolves.toBeNull();
		expect(backend.readTextFile).not.toHaveBeenCalled();
	});
});
