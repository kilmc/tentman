import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

vi.mock('$lib/content/service', () => ({
	deleteContentDocument: vi.fn()
}));

vi.mock('$lib/stores/content-cache', () => ({
	getCachedContent: vi.fn()
}));

import { actions } from './+page.server';
import { deleteContentDocument } from '$lib/content/service';
import { getCachedContent } from '$lib/stores/content-cache';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';

const collectionConfig = {
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
} as const;

function createRequest(form: Record<string, string>) {
	return {
		formData: async () => {
			const data = new FormData();
			for (const [key, value] of Object.entries(form)) {
				data.set(key, value);
			}
			return data;
		}
	};
}

describe('routes/pages/[page]/[itemId]/edit/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('preserves the explicit branch when redirecting to item preview changes', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			discoveredConfig: collectionConfig
		} as never);

		await expect(
			actions.saveToPreview({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({
					data: JSON.stringify({ title: 'Hello world' }),
					filename: 'hello-world.md',
					branch: 'preview-2026-04-06'
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location:
				'/pages/posts/hello-world/preview-changes?data=eyJ0aXRsZSI6IkhlbGxvIHdvcmxkIn0&filename=hello-world.md&branch=preview-2026-04-06'
		});
	});

	it('deletes the draft item from the explicit branch when provided', async () => {
		vi.mocked(requireDiscoveredConfig).mockResolvedValue({
			backend: { cacheKey: 'github:acme/docs' },
			discoveredConfig: collectionConfig
		} as never);
		vi.mocked(getCachedContent).mockResolvedValue([
			{
				_filename: 'hello-world.md',
				title: 'Hello world'
			}
		]);

		await expect(
			actions.delete({
				locals: {},
				params: {
					page: 'posts',
					itemId: 'hello-world'
				},
				request: createRequest({
					branch: 'preview-2026-04-06'
				}),
				cookies: {
					delete: vi.fn()
				}
			} as never)
		).rejects.toMatchObject({
			status: 303,
			location: '/pages/posts?deleted=true&branch=preview-2026-04-06'
		});

		expect(getCachedContent).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			collectionConfig.config,
			collectionConfig.path,
			'posts',
			'preview-2026-04-06'
		);
		expect(deleteContentDocument).toHaveBeenCalledWith(
			{ cacheKey: 'github:acme/docs' },
			collectionConfig.config,
			collectionConfig.path,
			{
				branch: 'preview-2026-04-06',
				filename: 'hello-world.md'
			}
		);
	});

	it('preserves the current route query when auth expires during item preview setup', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.saveToPreview({
			locals: {},
			params: {
				page: 'posts',
				itemId: 'hello-world'
			},
			request: createRequest({
				data: JSON.stringify({ title: 'Hello world' }),
				filename: 'hello-world.md',
				branch: 'preview-2026-04-06'
			}),
			cookies: {
				delete: vi.fn()
			},
			url: new URL('http://localhost/pages/posts/hello-world/edit?branch=preview-2026-04-06')
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/posts/hello-world/edit?branch=preview-2026-04-06'
		);
	});
});
