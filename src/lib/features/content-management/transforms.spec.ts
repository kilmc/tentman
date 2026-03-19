import { describe, expect, it } from 'vitest';
import { isParsedContentConfig, parseConfigFile, type ParsedContentConfig } from '$lib/config/parse';
import {
	getTemplateInfo,
	parseCollectionItem,
	processTemplate,
	serializeCollectionItem,
	toJsonFileContent
} from './transforms';

type ParsedDirectoryConfig = ParsedContentConfig & {
	content: {
		mode: 'directory';
		path: string;
		template: string;
		filename?: string;
	};
};

function parseDirectoryConfigFixture(content: string) {
	const parsed = parseConfigFile(content);

	if (!isParsedContentConfig(parsed) || parsed.content.mode !== 'directory') {
		throw new Error('Expected a parsed directory content config fixture');
	}

	return parsed as ParsedDirectoryConfig;
}

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

	it('resolves template info from directory content config state', () => {
		const config = parseDirectoryConfigFixture(
			JSON.stringify({
				type: 'content',
				label: 'Posts',
				itemLabel: 'Post',
				collection: true,
				content: {
					mode: 'directory',
					path: './posts',
					template: './templates/post.md'
				},
				blocks: [{ id: 'title', type: 'text', label: 'Title' }]
			})
		);

		expect(getTemplateInfo('content/posts.tentman.json', config)).toEqual({
			resolvedTemplatePath: 'content/templates/post.md',
			templateDir: 'content/templates',
			templateExt: '.md',
			templateFilename: 'post.md',
			isMarkdown: true
		});
	});
});
