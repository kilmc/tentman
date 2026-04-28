import { describe, expect, it } from 'vitest';
import {
	isParsedContentConfig,
	parseConfigFile,
	type ParsedContentConfig
} from '$lib/config/parse';
import {
	getTemplateInfo,
	parseCollectionItem,
	processTemplate,
	serializeCollectionItem,
	stringifyMarkdownCollectionItem,
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
			body: 'Body copy'
		};

		const serialized = serializeCollectionItem(item, true);
		const parsed = parseCollectionItem(serialized, true, 'hello.md');

		expect(parsed).toMatchObject({
			title: 'Hello',
			slug: 'hello',
			_filename: 'hello.md'
		});
		expect(typeof parsed.body === 'string' ? parsed.body.trim() : parsed.body).toBe('Body copy');
		expect(serialized).not.toContain('body: Body copy');
	});

	it('handles markdown collection items without a native Buffer global', () => {
		const originalBuffer = globalThis.Buffer;
		Object.defineProperty(globalThis, 'Buffer', {
			value: undefined,
			configurable: true,
			writable: true
		});

		try {
			const serialized = serializeCollectionItem(
				{
					title: 'Hello',
					slug: 'hello',
					body: 'Body copy'
				},
				true
			);
			const parsed = parseCollectionItem(serialized, true, 'hello.md');

			expect(parsed).toMatchObject({
				title: 'Hello',
				slug: 'hello',
				_filename: 'hello.md'
			});
			expect(typeof parsed.body === 'string' ? parsed.body.trim() : parsed.body).toBe('Body copy');
			expect(serialized).not.toContain('body: Body copy');
		} finally {
			Object.defineProperty(globalThis, 'Buffer', {
				value: originalBuffer,
				configurable: true,
				writable: true
			});
		}
	});

	it('recovers markdown items whose closing frontmatter fence is missing', () => {
		const parsed = parseCollectionItem(
			'---\nslug: berlin-neukoelln-kiezkulisse\ntitle: Berlin Neukolln Kiezkulisse\n*public art commission, City of Berlin*\n\nBody copy',
			true,
			'berlin-neukoelln-kiezkulisse.md'
		);

		expect(parsed).toMatchObject({
			slug: 'berlin-neukoelln-kiezkulisse',
			title: 'Berlin Neukolln Kiezkulisse',
			_filename: 'berlin-neukoelln-kiezkulisse.md'
		});
		expect(parsed.body).toBe('*public art commission, City of Berlin*\n\nBody copy');
	});

	it('rejects records with numeric keys before writing markdown frontmatter', () => {
		expect(() =>
			serializeCollectionItem(
				{
					0: '<',
					1: 's',
					title: 'Broken',
					body: 'Body copy'
				},
				true
			)
		).toThrow(/unexpected numeric keys/);
	});

	it('serializes markdown items whose body starts with a thematic break', () => {
		const serialized = stringifyMarkdownCollectionItem(
			'---\n\n*public art commission, City of Berlin*\n\n---\n\nBody copy',
			{
				title: 'Berlin-Neukolln Kiezkulisse',
				slug: 'berlin-neukoelln-kiezkulisse'
			}
		);

		const parsed = parseCollectionItem(serialized, true, 'berlin-neukoelln-kiezkulisse.md');

		expect(parsed).toMatchObject({
			title: 'Berlin-Neukolln Kiezkulisse',
			slug: 'berlin-neukoelln-kiezkulisse',
			_filename: 'berlin-neukoelln-kiezkulisse.md'
		});
		expect(parsed.body).toBe('---\n\n*public art commission, City of Berlin*\n\n---\n\nBody copy');
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
