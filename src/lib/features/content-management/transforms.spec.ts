import { describe, expect, it } from 'vitest';
import {
	parseCollectionItem,
	processTemplate,
	serializeCollectionItem,
	toJsonFileContent
} from './transforms';

describe('content-management/transforms', () => {
	it('serializes and parses markdown collection items symmetrically', () => {
		const item = {
			title: 'Hello',
			slug: 'hello',
			_body: 'Body copy'
		};

		const serialized = serializeCollectionItem(item, true);
		const parsed = parseCollectionItem(serialized, true, 'hello.md');

		expect(parsed).toMatchObject({
			title: 'Hello',
			slug: 'hello',
			_filename: 'hello.md'
		});
		expect(parsed._body?.trim()).toBe('Body copy');
	});

	it('renders template placeholders from item data', () => {
		expect(processTemplate('Title: {{title}}', { title: 'Hello' })).toBe('Title: Hello');
	});

	it('writes stable json content', () => {
		expect(toJsonFileContent({ title: 'Hello' })).toBe('{\n  "title": "Hello"\n}\n');
	});
});
