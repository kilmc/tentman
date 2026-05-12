import { describe, expect, it } from 'vitest';
import {
	getMarkdownContentComponentAvailabilityErrors,
	getUnknownEnabledContentComponentErrors
} from './availability';

describe('content component availability helpers', () => {
	it('reports unknown enabled components once', () => {
		expect(
			getUnknownEnabledContentComponentErrors(
				['buy-button', 'missing-widget', 'missing-widget'],
				new Set(['buy-button'])
			)
		).toEqual(['Markdown field enables unknown content component "missing-widget"']);
	});

	it('reports unknown and disabled markers in stored markdown', () => {
		expect(
			getMarkdownContentComponentAvailabilityErrors(
				':buy-button[Buy]{href="/tickets"} :missing-widget[Nope]',
				new Set(['buy-button', 'doc-link']),
				new Set(['doc-link'])
			)
		).toEqual([
			'Markdown field contains content component "buy-button" that is not enabled on this field',
			'Markdown field contains unknown content component "missing-widget"'
		]);
	});
});
