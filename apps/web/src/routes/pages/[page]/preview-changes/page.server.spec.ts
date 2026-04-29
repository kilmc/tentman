import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/page-context', () => ({
	requireDiscoveredConfig: vi.fn(),
	handleGitHubRouteError: vi.fn()
}));

import { actions } from './+page.server';
import { handleGitHubRouteError, requireDiscoveredConfig } from '$lib/server/page-context';

describe('routes/pages/[page]/preview-changes/+page.server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('preserves preview query params when auth expires during singleton draft save', async () => {
		vi.mocked(requireDiscoveredConfig).mockRejectedValue({ status: 401 });

		await actions.createPreview({
			locals: {},
			params: {
				page: 'about'
			},
			request: {
				formData: async () => new FormData()
			},
			cookies: {
				delete: vi.fn()
			},
			url: new URL(
				'http://localhost/pages/about/preview-changes?data=abc&branch=preview-2026-04-06'
			)
		} as never);

		expect(handleGitHubRouteError).toHaveBeenCalledWith(
			{ locals: {}, cookies: { delete: expect.any(Function) } },
			{ status: 401 },
			'/pages/about/preview-changes?data=abc&branch=preview-2026-04-06'
		);
	});
});
