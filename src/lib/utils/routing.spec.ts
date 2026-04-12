import { describe, expect, it } from 'vitest';
import {
	buildLoginRedirect,
	buildPathWithQuery,
	buildReposRedirect,
	buildReposReturnHref,
	getRoutePath,
	readOptionalSearchParam,
	sanitizeAuthRedirectTarget
} from './routing';

describe('routing utils', () => {
	it('returns the current route path including query params', () => {
		expect(
			getRoutePath({
				pathname: '/pages/about/preview-changes',
				search: '?data=abc&branch=preview-2026-04-06'
			})
		).toBe('/pages/about/preview-changes?data=abc&branch=preview-2026-04-06');
	});

	it('builds a login redirect from the current route including query params', () => {
		expect(
			buildLoginRedirect('/auth/login', {
				pathname: '/pages/about/edit',
				search: '?branch=preview-2026-04-06'
			})
		).toBe('/auth/login?redirect=%2Fpages%2Fabout%2Fedit%3Fbranch%3Dpreview-2026-04-06');
	});

	it('builds a repos redirect from the current route including query params', () => {
		expect(
			buildReposRedirect('/repos', {
				pathname: '/pages/about/edit',
				search: '?branch=preview-2026-04-06'
			})
		).toBe('/repos?returnTo=%2Fpages%2Fabout%2Fedit%3Fbranch%3Dpreview-2026-04-06');
	});

	it('builds a repos return href from a safe return target', () => {
		expect(buildReposReturnHref('/repos', '/pages/about')).toBe('/repos?returnTo=%2Fpages%2Fabout');
	});

	it('appends only present query params', () => {
		expect(
			buildPathWithQuery('/pages/posts/hello-world/preview-changes', {
				data: 'abc',
				filename: 'hello-world.md',
				branch: 'preview-2026-04-06',
				newFilename: undefined
			})
		).toBe(
			'/pages/posts/hello-world/preview-changes?data=abc&filename=hello-world.md&branch=preview-2026-04-06'
		);
	});

	it('treats empty search params as absent', () => {
		const searchParams = new URLSearchParams('branch=');

		expect(readOptionalSearchParam(searchParams, 'branch')).toBeUndefined();
	});

	it('keeps safe in-app auth redirect targets', () => {
		expect(
			sanitizeAuthRedirectTarget('/pages/about/preview-changes?data=abc&branch=preview-2026-04-06')
		).toBe('/pages/about/preview-changes?data=abc&branch=preview-2026-04-06');
	});

	it('falls back when the auth redirect target points back into auth routes', () => {
		expect(sanitizeAuthRedirectTarget('/auth/login?redirect=/pages')).toBe('/');
		expect(sanitizeAuthRedirectTarget('/auth/callback?code=123')).toBe('/');
	});

	it('falls back when the auth redirect target is external', () => {
		expect(sanitizeAuthRedirectTarget('https://github.com/login/oauth/authorize')).toBe('/');
		expect(sanitizeAuthRedirectTarget('//evil.example/phish')).toBe('/');
	});
});
