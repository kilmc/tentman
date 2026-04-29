import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

import { actions } from './+page.server';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';

describe('routes/pages/[page]/[itemId]/preview-changes/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('preserves preview query params when auth expires during item draft save', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.createPreview({
			locals: {},
			params: {
				page: 'posts',
				itemId: 'hello-world'
			},
			request: {
				formData: async () => new FormData()
			},
			cookies: {
				delete: vi.fn()
			},
			url: new URL(
				'http://localhost/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md&branch=preview-2026-04-06'
			)
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md&branch=preview-2026-04-06'
		);
	});
});
