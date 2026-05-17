import { Buffer } from 'node:buffer';
import matter from 'gray-matter';
import { parseJsonObject } from './json.js';

export function isMarkdownContentPath(contentPath) {
	return contentPath.endsWith('.md') || contentPath.endsWith('.markdown');
}

export function detectJsonIndent(source) {
	const match = source.match(/^[ \t]+(?=")/m);
	if (!match) {
		return '\t';
	}

	return match[0].includes('\t') ? '\t' : match[0].length;
}

export function parseMarkdownContentRecord(source) {
	ensureBufferGlobal();

	try {
		const parsed = matter(source);
		const frontmatterData =
			parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)
				? { ...parsed.data }
				: {};
		const frontmatterBody =
			typeof frontmatterData.body === 'string' ? frontmatterData.body : undefined;
		delete frontmatterData.body;

		return {
			...frontmatterData,
			body: parsed.content.length > 0 ? parsed.content : (frontmatterBody ?? '')
		};
	} catch (error) {
		const recovered = recoverMalformedMarkdownFrontmatter(source);
		if (recovered) {
			const frontmatterData = { ...recovered.data };
			const frontmatterBody =
				typeof frontmatterData.body === 'string' ? frontmatterData.body : undefined;
			delete frontmatterData.body;

			return {
				...frontmatterData,
				body: recovered.body.length > 0 ? recovered.body : (frontmatterBody ?? '')
			};
		}

		throw error;
	}
}

export function serializeMarkdownContentRecord(item) {
	ensureBufferGlobal();
	assertSerializableContentRecord(item);

	const normalizedItem = { ...item };
	delete normalizedItem._filename;

	const { body, ...frontmatterData } = normalizedItem;
	const frontmatterOnly = matter.stringify('', frontmatterData);
	const normalizedFrontmatter = frontmatterOnly.endsWith('\n\n')
		? frontmatterOnly.slice(0, -1)
		: frontmatterOnly;
	const normalizedBody = typeof body === 'string' ? body : '';

	if (normalizedBody.length === 0) {
		return normalizedFrontmatter;
	}

	return `${normalizedFrontmatter}${normalizedBody}`;
}

export function parseContentRecordFile(source, contentPath) {
	if (isMarkdownContentPath(contentPath)) {
		return parseMarkdownContentRecord(source);
	}

	return parseJsonObject(source, contentPath);
}

export function serializeContentRecordFile(item, contentPath, options = {}) {
	if (isMarkdownContentPath(contentPath)) {
		return serializeMarkdownContentRecord(item);
	}

	const indent = options.indent ?? '\t';
	return `${JSON.stringify(item, null, indent)}\n`;
}

export function updateContentRecordFileSource(source, contentPath, mutateRecord) {
	const currentRecord = parseContentRecordFile(source, contentPath);
	const nextRecord = mutateRecord({ ...currentRecord });

	return serializeContentRecordFile(nextRecord, contentPath, {
		indent: detectJsonIndent(source)
	});
}

function recoverMalformedMarkdownFrontmatter(source) {
	if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
		return null;
	}

	if (/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(source)) {
		return null;
	}

	const lines = source.split(/\r?\n/);
	let lastValid = null;

	for (let index = 1; index < lines.length; index += 1) {
		const candidate = lines.slice(1, index + 1).join('\n');

		try {
			const parsed = matter(`---\n${candidate}\n---\n`);
			if (!parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data)) {
				break;
			}

			lastValid = {
				endLine: index,
				data: parsed.data
			};
		} catch {
			break;
		}
	}

	if (!lastValid) {
		return null;
	}

	return {
		data: lastValid.data,
		body: lines.slice(lastValid.endLine + 1).join('\n').replace(/^\n/, '')
	};
}

function assertSerializableContentRecord(item) {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		throw new Error('Content item must be an object before it can be saved.');
	}

	const numericKeys = Object.keys(item).filter((key) => /^\d+$/.test(key));
	if (numericKeys.length > 0) {
		throw new Error(
			`Content item contains unexpected numeric keys (${numericKeys.slice(0, 5).join(', ')}). This usually means a text field was accidentally spread into the saved record.`
		);
	}
}

function ensureBufferGlobal() {
	if (typeof globalThis.Buffer === 'undefined') {
		globalThis.Buffer = Buffer;
	}
}
