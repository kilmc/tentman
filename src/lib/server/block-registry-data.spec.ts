import { describe, expect, it, vi } from 'vitest';
import { parseDiscoveredBlockConfig } from '$lib/config/discovery';
import { loadGitHubBlockRegistryData } from '$lib/server/block-registry-data';
import type { RootConfig } from '$lib/config/root-config';
import type { GitHubRepositoryBackend } from '$lib/repository/github';

function createBackend(rootConfig: RootConfig | null): GitHubRepositoryBackend {
	return {
		kind: 'github',
		cacheKey: 'github:test/repo',
		label: 'test/repo',
		supportsDraftBranches: true,
		owner: 'test',
		repo: 'repo',
		fullName: 'test/repo',
		octokit: {} as GitHubRepositoryBackend['octokit'],
		async discoverConfigs() {
			return [];
		},
		async discoverBlockConfigs() {
			return [
				parseDiscoveredBlockConfig(
					'tentman/blocks/seo.tentman.json',
					`{
						"type": "block",
						"id": "seo",
						"label": "SEO",
						"blocks": [{ "id": "metaTitle", "type": "text" }]
					}`
				)
			];
		},
		async readRootConfig() {
			return rootConfig;
		},
		async readTextFile() {
			return '';
		},
		async writeTextFile() {},
		async deleteFile() {},
		async listDirectory() {
			return [];
		},
		async fileExists() {
			return false;
		}
	};
}

describe('loadGitHubBlockRegistryData', () => {
	it('loads structured-only package blocks for GitHub-backed routes', async () => {
		const result = await loadGitHubBlockRegistryData(
			createBackend({
				blockPackages: ['@acme/tentman-blocks']
			}),
			{
				loadBlockPackageModule: vi.fn().mockResolvedValue({
					blockPackage: {
						blocks: [
							{
								config: {
									type: 'block',
									id: 'heroBanner',
									label: 'Hero Banner',
									blocks: [
										{ id: 'title', type: 'text' },
										{ id: 'seo', type: 'seo' }
									]
								}
							}
						]
					}
				})
			}
		);

		expect(result.blockRegistryError).toBeNull();
		expect(result.blockConfigs).toHaveLength(1);
		expect(result.packageBlocks).toEqual([
			{
				packageName: '@acme/tentman-blocks',
				config: {
					type: 'block',
					id: 'heroBanner',
					label: 'Hero Banner',
					blocks: [
						{ id: 'title', type: 'text' },
						{ id: 'seo', type: 'seo' }
					]
				}
			}
		]);
	});

	it('surfaces an explicit error when a package block uses a direct adapter export', async () => {
		const result = await loadGitHubBlockRegistryData(
			createBackend({
				blockPackages: ['@acme/tentman-blocks']
			}),
			{
				loadBlockPackageModule: vi.fn().mockResolvedValue({
					blockPackage: {
						blocks: [
							{
								config: {
									type: 'block',
									id: 'heroBanner',
									label: 'Hero Banner',
									blocks: [{ id: 'title', type: 'text' }]
								},
								adapter: {
									type: 'heroBanner',
									getDefaultValue() {
										return [];
									}
								}
							}
						]
					}
				})
			}
		);

		expect(result.packageBlocks).toEqual([]);
		expect(result.blockRegistryError).toMatch(
			/not yet supported in the current GitHub-backed package runtime/
		);
	});
});
