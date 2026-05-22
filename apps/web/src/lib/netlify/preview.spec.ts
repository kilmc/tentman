import { describe, expect, it } from 'vitest';
import { getNetlifyPreviewUrl } from './preview';

describe('lib/netlify/preview', () => {
	it('builds the Netlify branch preview URL for the managed Tentman draft branch', () => {
		expect(getNetlifyPreviewUrl('tentman-preview', 'docs-site')).toBe(
			'https://tentman-preview--docs-site.netlify.app'
		);
	});

	it('normalizes slash-delimited preview branches into Netlify-safe subdomains', () => {
		expect(getNetlifyPreviewUrl('preview/kilian_docs', 'docs-site')).toBe(
			'https://preview-kilian-docs--docs-site.netlify.app'
		);
	});
});
