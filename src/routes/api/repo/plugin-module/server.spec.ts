import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageContextMocks = vi.hoisted(() => ({
	readRootConfig: vi.fn(),
	readTextFile: vi.fn(),
	requireGitHubRepository: vi.fn()
}));

vi.mock('$lib/server/page-context', () => ({
	requireGitHubRepository: pageContextMocks.requireGitHubRepository
}));

import { GET } from './+server';

function createRequest(path: string | null) {
	const url = new URL('http://localhost/api/repo/plugin-module');

	if (path !== null) {
		url.searchParams.set('path', path);
	}

	return {
		url,
		locals: {},
		cookies: {
			delete: vi.fn()
		}
	};
}

describe('GET /api/repo/plugin-module', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pageContextMocks.readRootConfig.mockResolvedValue(null);
		pageContextMocks.readTextFile.mockResolvedValue('export default {}');
		pageContextMocks.requireGitHubRepository.mockReturnValue({
			backend: {
				readRootConfig: pageContextMocks.readRootConfig,
				readTextFile: pageContextMocks.readTextFile
			}
		});
	});

	it('returns JavaScript plugin modules from safe repo-relative paths', async () => {
		const response = await GET(createRequest('tentman/plugins/buy-button/plugin.js') as never);

		expect(pageContextMocks.readTextFile).toHaveBeenCalledWith(
			'tentman/plugins/buy-button/plugin.js'
		);
		expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
		expect(await response.text()).toBe('export default {}');
	});

	it('allows plugin module entrypoints under a configured pluginsDir', async () => {
		pageContextMocks.readRootConfig.mockResolvedValue({
			pluginsDir: './cms/plugins'
		});

		await GET(createRequest('cms/plugins/buy-button/plugin.js') as never);

		expect(pageContextMocks.readTextFile).toHaveBeenCalledWith('cms/plugins/buy-button/plugin.js');
	});

	it('allows mjs plugin module entrypoints', async () => {
		await GET(createRequest('tentman/plugins/buy-button/plugin.mjs') as never);

		expect(pageContextMocks.readTextFile).toHaveBeenCalledWith(
			'tentman/plugins/buy-button/plugin.mjs'
		);
	});

	it('rejects missing plugin module paths', async () => {
		await expect(GET(createRequest(null) as never)).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Missing plugin module path'
			}
		});
		expect(pageContextMocks.readTextFile).not.toHaveBeenCalled();
	});

	it('rejects unsafe plugin module paths', async () => {
		for (const path of [
			'/tentman/plugins/buy-button/plugin.js',
			'tentman/plugins/../secrets/plugin.js',
			'tentman/plugins/buy-button/notes.md'
		]) {
			await expect(GET(createRequest(path) as never)).rejects.toMatchObject({
				status: 400,
				body: {
					message: 'Invalid plugin module path'
				}
			});
		}

		expect(pageContextMocks.readTextFile).not.toHaveBeenCalled();
	});

	it('rejects plugin module paths outside the configured pluginsDir', async () => {
		pageContextMocks.readRootConfig.mockResolvedValue({
			pluginsDir: './cms/plugins'
		});

		await expect(
			GET(createRequest('tentman/plugins/buy-button/plugin.js') as never)
		).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Plugin module path is outside pluginsDir'
			}
		});

		expect(pageContextMocks.readTextFile).not.toHaveBeenCalled();
	});
});
