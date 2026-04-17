import { describe, expect, it } from 'vitest';
import buyButtonPlugin from '../test/fixtures/plugins/buy-button/plugin.js';

function transform(markdown: string): string {
	const transformMarkdown = buyButtonPlugin.preview?.transformMarkdown;

	if (!transformMarkdown) {
		throw new Error('Expected buy-button preview transform');
	}

	return transformMarkdown(markdown);
}

describe('buy-button preview plugin', () => {
	it('adds preview button classes to complete markers', () => {
		expect(
			transform(
				'<a data-tentman-plugin="buy-button" href="https://example.com" data-label="Buy" data-variant="secondary">Buy</a>'
			)
		).toBe(
			'<a href="https://example.com" data-label="Buy" data-variant="secondary" class="tentman-preview-buy-button tentman-preview-buy-button-secondary">Buy</a>'
		);
	});

	it('preserves existing classes when enhancing markers', () => {
		expect(
			transform(
				'<a class="site-buy-link" data-tentman-plugin="buy-button" href="https://example.com">Buy</a>'
			)
		).toContain('class="site-buy-link tentman-preview-buy-button"');
	});

	it('handles partial markers without variant metadata', () => {
		expect(transform('<a data-tentman-plugin="buy-button" href="/shop">Buy</a>')).toBe(
			'<a href="/shop" class="tentman-preview-buy-button">Buy</a>'
		);
	});

	it('handles single-quoted stored markers', () => {
		expect(
			transform("<a data-tentman-plugin='buy-button' data-variant='secondary' href='/shop'>Buy</a>")
		).toBe(
			"<a data-variant='secondary' href='/shop' class=\"tentman-preview-buy-button tentman-preview-buy-button-secondary\">Buy</a>"
		);
	});

	it('leaves malformed markers untouched', () => {
		const markdown = '<a data-tentman-plugin="buy-button" href="/shop">Buy';

		expect(transform(markdown)).toBe(markdown);
	});
});
