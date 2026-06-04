import { beforeEach, describe, expect, it, vi } from 'vitest';

const pageContextMocks = vi.hoisted(() => ({
	requireGitHubContentRepository: vi.fn(),
	readRootConfig: vi.fn(),
	fileExists: vi.fn(),
	listDirectory: vi.fn(),
	readTextFile: vi.fn()
}));

vi.mock('$lib/server/page-context', () => ({
	requireGitHubContentRepository: pageContextMocks.requireGitHubContentRepository
}));

import { GET } from './+server';

function createRequest(path: string | null, mode: string | null) {
	const url = new URL('http://localhost/api/repo/content-components');

	if (path !== null) {
		url.searchParams.set('path', path);
	}

	if (mode !== null) {
		url.searchParams.set('mode', mode);
	}

	return {
		url,
		locals: {},
		cookies: {
			delete: vi.fn()
		}
	};
}

describe('GET /api/repo/content-components', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		pageContextMocks.readRootConfig.mockResolvedValue(null);
		pageContextMocks.fileExists.mockResolvedValue(true);
		pageContextMocks.listDirectory.mockResolvedValue([]);
		pageContextMocks.readTextFile.mockResolvedValue('{}');
		pageContextMocks.requireGitHubContentRepository.mockResolvedValue({
			backend: {
				readRootConfig: pageContextMocks.readRootConfig,
				fileExists: pageContextMocks.fileExists,
				listDirectory: pageContextMocks.listDirectory,
				readTextFile: pageContextMocks.readTextFile
			},
			draftBranch: null
		});
	});

	it('reads content component files from the default components directory', async () => {
		const response = await GET(
			createRequest('src/lib/content-components/buy-button/component.json', 'read') as never
		);

		expect(pageContextMocks.readTextFile).toHaveBeenCalledWith(
			'src/lib/content-components/buy-button/component.json'
		);
		expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8');
	});

	it('allows requests under a configured componentsDir', async () => {
		pageContextMocks.readRootConfig.mockResolvedValue({
			componentsDir: './cms/components'
		});

		await GET(createRequest('cms/components/buy-button/component.json', 'read') as never);

		expect(pageContextMocks.readTextFile).toHaveBeenCalledWith(
			'cms/components/buy-button/component.json'
		);
	});

	it('rejects requests outside the configured componentsDir', async () => {
		pageContextMocks.readRootConfig.mockResolvedValue({
			componentsDir: './cms/components'
		});

		await expect(
			GET(createRequest('src/lib/content-components/buy-button/component.json', 'read') as never)
		).rejects.toMatchObject({
			status: 400,
			body: {
				message: 'Invalid content component path'
			}
		});
	});

	it('reads content components from the active draft branch when one exists', async () => {
		pageContextMocks.requireGitHubContentRepository.mockResolvedValue({
			backend: {
				readRootConfig: pageContextMocks.readRootConfig,
				fileExists: pageContextMocks.fileExists,
				listDirectory: pageContextMocks.listDirectory,
				readTextFile: pageContextMocks.readTextFile
			},
			draftBranch: 'tentman-preview'
		});

		await GET(
			createRequest(
				'src/lib/content-components/project-gallery-embed/component.json',
				'read'
			) as never
		);

		expect(pageContextMocks.requireGitHubContentRepository).toHaveBeenCalled();
		expect(pageContextMocks.readTextFile).toHaveBeenCalledWith(
			'src/lib/content-components/project-gallery-embed/component.json'
		);
	});
});
