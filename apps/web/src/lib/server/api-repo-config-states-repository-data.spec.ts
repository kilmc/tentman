import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

const pageContextMocks = vi.hoisted(() => ({
	requireGitHubContentRepository: vi.fn()
}));

vi.mock('$lib/server/page-context', () => ({
	requireGitHubContentRepository: pageContextMocks.requireGitHubContentRepository
}));

vi.mock('$lib/features/content-management/navigation-manifest', () => ({
	loadNavigationManifestState: vi.fn(async () => ({
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	}))
}));

import { GET } from '../../routes/api/repo/config-states/+server';
import { getCachedContent } from '$lib/stores/content-cache';
import {
	clearRepositorySnapshotCache,
	clearSingletonConfigStateCache,
	clearSingletonDocumentCache
} from '$lib/server/repository-data';

function encodeBlob(value: string): string {
	return Buffer.from(value, 'utf-8').toString('base64');
}

function createGitHubBackend(files: Record<string, string>) {
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
		kind: 'github',
		cacheKey: 'github:acme/docs?ref=main',
		label: 'acme/docs',
		supportsDraftBranches: true,
		owner: 'acme',
		repo: 'docs',
		fullName: 'acme/docs',
		octokit,
		discoverConfigs: vi.fn(async () => []),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => null),
		readTextFile: vi.fn(async () => {
			throw new Error('legacy text reads should not run');
		}),
		writeTextFile: vi.fn(async () => undefined),
		writeBinaryFile: vi.fn(async () => undefined),
		deleteFile: vi.fn(async () => undefined),
		listDirectory: vi.fn(async () => {
			throw new Error('legacy directory listing should not run');
		}),
		fileExists: vi.fn(async () => false)
	};
}

describe('GET /api/repo/config-states repository data', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		clearRepositorySnapshotCache();
		clearSingletonConfigStateCache();
		clearSingletonDocumentCache();
	});

	it('returns singleton states from GitHub blob data without loading full content', async () => {
		const backend = createGitHubBackend({
			'tentman.json': `{
				"configsDir": "tentman/configs",
				"siteName": "Acme Docs"
			}`,
			'tentman/configs/about.tentman.json': `{
				"type": "content",
				"label": "About",
				"state": {
					"blockId": "published",
					"cases": [
						{ "value": false, "label": "Draft", "variant": "warning", "icon": "file-pen" },
						{ "value": true, "label": "Published", "variant": "success" }
					]
				},
				"content": {
					"mode": "file",
					"path": "../../src/content/about.md"
				},
				"blocks": [
					{ "id": "title", "type": "text", "label": "Title" },
					{ "id": "published", "type": "toggle", "label": "Published" }
				]
			}`,
			'src/content/about.md': `---\ntitle: "About"\npublished: false\n---\nAbout body`
		});
		pageContextMocks.requireGitHubContentRepository.mockResolvedValue({
			backend,
			draftBranch: null
		} as never);

		const response = await GET({
			locals: {
				isAuthenticated: true,
				githubToken: 'secret-token',
				selectedRepo: {
					owner: 'acme',
					name: 'docs',
					full_name: 'acme/docs'
				}
			},
			cookies: {
				delete: vi.fn()
			}
		} as never);

		expect(await response.json()).toMatchObject({
			statesBySlug: {
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
			},
			workflowData: {
				identity: {
					mode: 'github',
					workspaceKey: 'github:acme/docs?ref=main',
					workspaceLabel: 'acme/docs',
					hasEditableDraft: false
				},
				stateConfigCount: 1,
				readiness: 'ready',
				cacheMiss: null
			}
		});
		expect(getCachedContent).not.toHaveBeenCalled();
		expect(backend.readTextFile).not.toHaveBeenCalled();
		expect(backend.discoverConfigs).not.toHaveBeenCalled();
	});
});
