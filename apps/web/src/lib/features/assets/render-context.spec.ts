import { describe, expect, it } from 'vitest';
import { getAssetRenderContext, resolveAssetUrlForRender } from './render-context';

const githubRepo = {
	owner: 'acme',
	name: 'docs',
	full_name: 'acme/docs',
	default_branch: 'main'
};

const rootConfig = {
	assets: {
		path: './static/images/projects',
		publicPath: '/images/projects'
	}
};

describe('features/assets/render-context', () => {
	it('routes GitHub relative assets through the repo asset proxy with root assets', () => {
		const context = getAssetRenderContext({
			selectedBackend: { kind: 'github', repo: githubRepo },
			selectedRepo: githubRepo,
			rootConfig,
			localRootConfig: {
				assets: {
					path: './static/local',
					publicPath: '/local'
				}
			},
			localPreviewUrl: 'http://localhost:5173/'
		});

		expect(resolveAssetUrlForRender('hero.jpg', context)).toBe(
			'/api/repo/asset?value=hero.jpg&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
		);
	});

	it('routes GitHub public asset paths through the repo asset proxy', () => {
		const context = getAssetRenderContext({
			selectedBackend: { kind: 'github', repo: githubRepo },
			selectedRepo: githubRepo,
			rootConfig,
			localRootConfig: null,
			localPreviewUrl: null
		});

		expect(resolveAssetUrlForRender('/images/projects/hero.jpg', context)).toBe(
			'/api/repo/asset?value=%2Fimages%2Fprojects%2Fhero.jpg&assetPath=.%2Fstatic%2Fimages%2Fprojects&publicPath=%2Fimages%2Fprojects&owner=acme&repo=docs&branch=main'
		);
	});

	it('ignores local preview URLs in GitHub mode', () => {
		const context = getAssetRenderContext({
			selectedBackend: { kind: 'github', repo: githubRepo },
			selectedRepo: githubRepo,
			rootConfig,
			localRootConfig: {
				assets: {
					path: './static/local',
					publicPath: '/local'
				},
				local: {
					previewUrl: 'http://localhost:4173/'
				}
			},
			localPreviewUrl: 'http://localhost:5173/'
		});

		const resolved = resolveAssetUrlForRender('hero.jpg', context);

		expect(resolved).toContain('/api/repo/asset?');
		expect(resolved).not.toContain('localhost');
	});

	it('uses local preview URLs in local mode', () => {
		const context = getAssetRenderContext({
			selectedBackend: {
				kind: 'local',
				repo: {
					name: 'Docs',
					pathLabel: '~/docs'
				}
			},
			selectedRepo: githubRepo,
			rootConfig,
			localRootConfig: rootConfig,
			localPreviewUrl: 'http://localhost:5173/'
		});

		expect(resolveAssetUrlForRender('hero.jpg', context)).toBe(
			'http://localhost:5173/images/projects/hero.jpg'
		);
	});

	it('keeps external absolute URLs unchanged', () => {
		const context = getAssetRenderContext({
			selectedBackend: { kind: 'github', repo: githubRepo },
			selectedRepo: githubRepo,
			rootConfig,
			localRootConfig: null,
			localPreviewUrl: 'http://localhost:5173/'
		});

		expect(resolveAssetUrlForRender('https://example.com/hero.jpg', context)).toBe(
			'https://example.com/hero.jpg'
		);
	});

	it('does not invent a preview URL when no backend is selected', () => {
		const context = getAssetRenderContext({
			selectedBackend: null,
			selectedRepo: null,
			rootConfig,
			localRootConfig: rootConfig,
			localPreviewUrl: 'http://localhost:5173/'
		});

		expect(resolveAssetUrlForRender('hero.jpg', context)).toBeNull();
		expect(resolveAssetUrlForRender('/images/projects/hero.jpg', context)).toBe(
			'/images/projects/hero.jpg'
		);
	});
});
