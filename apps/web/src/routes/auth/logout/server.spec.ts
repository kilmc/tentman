import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/auth/github', () => ({
	clearGitHubSession: vi.fn()
}));

import { GET } from './+server';
import { clearGitHubSession } from '$lib/server/auth/github';

describe('routes/auth/logout/+server', () => {
	it('clears the GitHub session and redirects home', async () => {
		const cookies = {
			get: vi.fn(),
			set: vi.fn(),
			delete: vi.fn()
		};

		try {
			await GET({
				cookies
			} as never);
		} catch (error) {
			expect(clearGitHubSession).toHaveBeenCalledWith(cookies);
			expect(error).toMatchObject({
				status: 302,
				location: '/'
			});
			return;
		}

		throw new Error('Expected logout route to redirect');
	});
});
