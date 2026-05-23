const ALLOWED_PREVIEW_TAGS = new Set([
	'div',
	'span',
	'p',
	'strong',
	'em',
	'b',
	'i',
	'ul',
	'ol',
	'li',
	'br',
	'hr',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'img'
]);
const PREVIEW_VOID_TAGS = new Set(['br', 'hr', 'img']);
const STRIP_CONTENT_TAGS = new Set([
	'script',
	'style',
	'link',
	'meta',
	'base',
	'template',
	'iframe',
	'object',
	'embed',
	'canvas',
	'svg'
]);

/**
 * @typedef {{
 *   kind: 'tag' | 'attribute' | 'img-src';
 *   tagName: string;
 *   attributeName?: string;
 *   value?: string;
 *   message: string;
 * }} PreviewDiagnostic
 */

/**
 * @typedef {{
 *   tagName: string;
 *   attributeName?: string;
 *   value?: string;
 * }} PreviewDiagnosticDetails
 */

/** @param {unknown} value */
function escapeHtmlAttribute(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/** @param {unknown} value */
function escapeHtmlText(value) {
	return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

/**
 * @param {'tag' | 'attribute' | 'img-src'} kind
 * @param {PreviewDiagnosticDetails} details
 * @returns {PreviewDiagnostic}
 */
function createDiagnostic(kind, details) {
	if (kind === 'tag') {
		return {
			kind,
			tagName: details.tagName,
			message: `Stripped unsupported <${details.tagName}> preview markup`
		};
	}

	if (kind === 'attribute') {
		return {
			kind,
			tagName: details.tagName,
			attributeName: details.attributeName,
			message: `Stripped unsupported ${details.attributeName} attribute from <${details.tagName}>`
		};
	}

	return {
		kind,
		tagName: details.tagName,
		attributeName: details.attributeName,
		value: details.value,
		message: `Blocked unsafe image src on <${details.tagName}>`
	};
}

/** @param {string} source */
function stripNunjucksSyntax(source) {
	return source
		.replaceAll(/\{#[\s\S]*?#\}/g, '')
		.replaceAll(/\{\{[\s\S]*?\}\}/g, '')
		.replaceAll(/\{%[\s\S]*?%\}/g, '');
}

/**
 * @param {string} html
 * @param {number} startIndex
 */
function findTagEnd(html, startIndex) {
	let quote = null;

	for (let index = startIndex + 1; index < html.length; index += 1) {
		const character = html[index];
		if (quote) {
			if (character === quote) {
				quote = null;
			}
			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (character === '>') {
			return index;
		}
	}

	return -1;
}

/**
 * @param {string} source
 * @returns {Array<{ name: string; value: string }>}
 */
function parseAttributes(source) {
	/** @type {Array<{ name: string; value: string }>} */
	const attributes = [];
	const attributePattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

	for (const match of source.matchAll(attributePattern)) {
		attributes.push({
			name: match[1].toLowerCase(),
			value: match[2] ?? match[3] ?? match[4] ?? ''
		});
	}

	return attributes;
}

/** @param {unknown} value */
function isAllowedPreviewImageSrc(value) {
	if (typeof value !== 'string') {
		return false;
	}

	const normalizedValue = value.trim();
	if (normalizedValue.length === 0) {
		return false;
	}

	if (normalizedValue.startsWith('//')) {
		return false;
	}

	if (
		normalizedValue.startsWith('/') ||
		normalizedValue.startsWith('./') ||
		normalizedValue.startsWith('../')
	) {
		return true;
	}

	if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(normalizedValue)) {
		try {
			const parsed = new URL(normalizedValue);
			return parsed.protocol === 'http:' || parsed.protocol === 'https:';
		} catch {
			return false;
		}
	}

	return !/[<>"'\s]/.test(normalizedValue);
}

/**
 * @param {string} tagName
 * @param {string} source
 * @param {PreviewDiagnostic[]} diagnostics
 */
function sanitizePreviewAttributes(tagName, source, diagnostics) {
	/** @type {string[]} */
	const sanitized = [];

	for (const attribute of parseAttributes(source)) {
		if (attribute.name === 'class') {
			if (attribute.value.trim().length > 0) {
				sanitized.push(` class="${escapeHtmlAttribute(attribute.value.trim())}"`);
			}
			continue;
		}

		if (tagName === 'img' && attribute.name === 'alt') {
			sanitized.push(` alt="${escapeHtmlAttribute(attribute.value)}"`);
			continue;
		}

		if (tagName === 'img' && attribute.name === 'src') {
			if (isAllowedPreviewImageSrc(attribute.value)) {
				sanitized.push(` src="${escapeHtmlAttribute(attribute.value.trim())}"`);
			} else {
				diagnostics.push(
					createDiagnostic('img-src', {
						tagName,
						attributeName: attribute.name,
						value: attribute.value
					})
				);
			}
			continue;
		}

		diagnostics.push(
			createDiagnostic('attribute', {
				tagName,
				attributeName: attribute.name
			})
		);
	}

	return sanitized.join('');
}

/**
 * @param {string[]} openTags
 * @param {string} tagName
 * @param {string} output
 */
function closeTagStackUntil(openTags, tagName, output) {
	const matchIndex = openTags.lastIndexOf(tagName);
	if (matchIndex === -1) {
		return output;
	}

	for (let index = openTags.length - 1; index >= matchIndex; index -= 1) {
		output += `</${openTags[index]}>`;
	}

	openTags.length = matchIndex;
	return output;
}

/**
 * @param {string} html
 * @returns {{ html: string; diagnostics: PreviewDiagnostic[] }}
 */
export function sanitizeContentComponentPreviewHtml(html) {
	const source = typeof html === 'string' ? html : '';
	/** @type {PreviewDiagnostic[]} */
	const diagnostics = [];
	/** @type {string[]} */
	const openTags = [];
	/** @type {string[]} */
	const strippedContentStack = [];
	let output = '';
	let index = 0;

	while (index < source.length) {
		const nextTagIndex = source.indexOf('<', index);
		if (nextTagIndex === -1) {
			if (strippedContentStack.length === 0) {
				output += source.slice(index);
			}
			break;
		}

		if (strippedContentStack.length === 0 && nextTagIndex > index) {
			output += source.slice(index, nextTagIndex);
		}

		if (source.startsWith('<!--', nextTagIndex)) {
			const commentEnd = source.indexOf('-->', nextTagIndex + 4);
			index = commentEnd === -1 ? source.length : commentEnd + 3;
			continue;
		}

		const tagEndIndex = findTagEnd(source, nextTagIndex);
		if (tagEndIndex === -1) {
			if (strippedContentStack.length === 0) {
				output += escapeHtmlText(source.slice(nextTagIndex));
			}
			break;
		}

		const rawTag = source.slice(nextTagIndex + 1, tagEndIndex);
		const normalizedTag = rawTag.trim();
		const isClosingTag = normalizedTag.startsWith('/');
		const tagBody = isClosingTag ? normalizedTag.slice(1).trim() : normalizedTag;
		const tagNameMatch = tagBody.match(/^([A-Za-z0-9-]+)/);

		if (!tagNameMatch) {
			if (strippedContentStack.length === 0) {
				output += escapeHtmlText(source.slice(nextTagIndex, tagEndIndex + 1));
			}
			index = tagEndIndex + 1;
			continue;
		}

		const tagName = tagNameMatch[1].toLowerCase();
		const attributeSource = tagBody.slice(tagNameMatch[0].length).replace(/\/\s*$/, '');
		const isSelfClosing = /\/\s*$/.test(tagBody) || PREVIEW_VOID_TAGS.has(tagName);

		if (strippedContentStack.length > 0) {
			if (!isClosingTag && STRIP_CONTENT_TAGS.has(tagName) && !isSelfClosing) {
				strippedContentStack.push(tagName);
			} else if (isClosingTag && strippedContentStack.at(-1) === tagName) {
				strippedContentStack.pop();
			}

			index = tagEndIndex + 1;
			continue;
		}

		if (isClosingTag) {
			if (ALLOWED_PREVIEW_TAGS.has(tagName) && !PREVIEW_VOID_TAGS.has(tagName)) {
				output = closeTagStackUntil(openTags, tagName, output);
			}
			index = tagEndIndex + 1;
			continue;
		}

		if (STRIP_CONTENT_TAGS.has(tagName)) {
			diagnostics.push(createDiagnostic('tag', { tagName }));
			if (!isSelfClosing) {
				strippedContentStack.push(tagName);
			}
			index = tagEndIndex + 1;
			continue;
		}

		if (!ALLOWED_PREVIEW_TAGS.has(tagName)) {
			diagnostics.push(createDiagnostic('tag', { tagName }));
			index = tagEndIndex + 1;
			continue;
		}

		output += `<${tagName}${sanitizePreviewAttributes(tagName, attributeSource, diagnostics)}>`;
		if (!isSelfClosing) {
			openTags.push(tagName);
		}
		index = tagEndIndex + 1;
	}

	for (let openIndex = openTags.length - 1; openIndex >= 0; openIndex -= 1) {
		output += `</${openTags[openIndex]}>`;
	}

	return {
		html: output,
		diagnostics
	};
}

/**
 * @param {string} source
 * @returns {{ html: string; diagnostics: PreviewDiagnostic[] }}
 */
export function inspectContentComponentPreviewTemplateSource(source) {
	return sanitizeContentComponentPreviewHtml(stripNunjucksSyntax(source));
}
