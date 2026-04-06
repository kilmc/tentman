import { describe, expect, it, vi } from 'vitest';
import {
	EMPTY_REPO_CONFIGS_BOOTSTRAP,
	loadRepoConfigsBootstrap,
	normalizeRepoConfigsBootstrap
} from './config-bootstrap';

describe('repository/config-bootstrap', () => {
	it('normalizes missing repo config fields to safe defaults', () => {
		expect(normalizeRepoConfigsBootstrap({})).toEqual(EMPTY_REPO_CONFIGS_BOOTSTRAP);
	});

	it('loads the repo config bootstrap payload from /api/repo/configs', async () => {
		const fetcher = vi.fn(
			async () =>
				new Response(
					JSON.stringify({
						configs: [
							{
								slug: 'posts',
								path: 'content/posts.tentman.json',
								config: {
									label: 'Posts',
									collection: true,
									content: {
										mode: 'directory'
									},
									blocks: []
								}
							}
						],
						blockConfigs: [],
						rootConfig: {
							siteName: 'Acme Docs'
						}
					})
				)
		);

		expect(await loadRepoConfigsBootstrap(fetcher as typeof fetch)).toEqual({
			configs: [
				{
					slug: 'posts',
					path: 'content/posts.tentman.json',
					config: {
						label: 'Posts',
						collection: true,
						content: {
							mode: 'directory'
						},
						blocks: []
					}
				}
			],
			blockConfigs: [],
			rootConfig: {
				siteName: 'Acme Docs'
			}
		});
		expect(fetcher).toHaveBeenCalledWith('/api/repo/configs');
	});
});
