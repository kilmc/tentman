const BLOCKED_SELECTOR_PATTERNS = [/:host\b/i, /:host-context\b/i, /::slotted\b/i, /::part\b/i];
const BLOCKED_PROPERTIES = new Set([
	'z-index',
	'pointer-events',
	'transform',
	'transform-origin',
	'transform-style',
	'animation',
	'animation-name',
	'animation-duration',
	'animation-delay',
	'animation-direction',
	'animation-fill-mode',
	'animation-iteration-count',
	'animation-play-state',
	'animation-timing-function',
	'animation-composition',
	'animation-range',
	'animation-range-end',
	'animation-range-start',
	'timeline-scope',
	'transition',
	'transition-property',
	'transition-duration',
	'transition-delay',
	'transition-timing-function',
	'transition-behavior'
]);

/**
 * @typedef {{
 *   kind: 'at-rule' | 'selector' | 'declaration';
 *   atRule?: string;
 *   selector?: string;
 *   property?: string;
 *   value?: string;
 *   message: string;
 * }} PreviewCssDiagnostic
 */

/**
 * @param {string} source
 * @returns {string}
 */
function stripCssComments(source) {
	return source.replaceAll(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * @param {string} atRule
 * @returns {PreviewCssDiagnostic}
 */
function createAtRuleDiagnostic(atRule) {
	return {
		kind: 'at-rule',
		atRule,
		message: `Stripped unsupported ${atRule} preview CSS rule`
	};
}

/**
 * @param {string} selector
 * @returns {PreviewCssDiagnostic}
 */
function createSelectorDiagnostic(selector) {
	return {
		kind: 'selector',
		selector,
		message: `Stripped unsupported preview CSS selector "${selector}"`
	};
}

/**
 * @param {string} property
 * @param {string} value
 * @param {'declaration' | 'value'} [reason='declaration']
 * @returns {PreviewCssDiagnostic}
 */
function createDeclarationDiagnostic(property, value, reason = 'declaration') {
	return {
		kind: 'declaration',
		property,
		value,
		message:
			reason === 'value'
				? `Blocked unsafe preview CSS value for ${property}`
				: `Stripped unsupported ${property} declaration from preview CSS`
	};
}

/**
 * @param {string} source
 * @param {number} startIndex
 * @returns {number}
 */
function readCssString(source, startIndex) {
	const quote = source[startIndex];
	let index = startIndex + 1;

	while (index < source.length) {
		if (source[index] === '\\') {
			index += 2;
			continue;
		}

		if (source[index] === quote) {
			return index;
		}

		index += 1;
	}

	return source.length - 1;
}

/**
 * @param {string} source
 * @param {number} startIndex
 * @param {Set<string>} delimiters
 * @returns {number}
 */
function findTopLevelDelimiter(source, startIndex, delimiters) {
	let parenthesesDepth = 0;
	let bracketDepth = 0;

	for (let index = startIndex; index < source.length; index += 1) {
		const character = source[index];

		if (character === '"' || character === "'") {
			index = readCssString(source, index);
			continue;
		}

		if (character === '(') {
			parenthesesDepth += 1;
			continue;
		}

		if (character === ')') {
			parenthesesDepth = Math.max(0, parenthesesDepth - 1);
			continue;
		}

		if (character === '[') {
			bracketDepth += 1;
			continue;
		}

		if (character === ']') {
			bracketDepth = Math.max(0, bracketDepth - 1);
			continue;
		}

		if (parenthesesDepth === 0 && bracketDepth === 0 && delimiters.has(character)) {
			return index;
		}
	}

	return -1;
}

/**
 * @param {string} source
 * @param {number} startIndex
 * @returns {number}
 */
function skipAtRule(source, startIndex) {
	const blockStart = findTopLevelDelimiter(source, startIndex, new Set(['{', ';']));
	if (blockStart === -1) {
		return source.length;
	}

	if (source[blockStart] === ';') {
		return blockStart + 1;
	}

	let depth = 1;
	for (let index = blockStart + 1; index < source.length; index += 1) {
		const character = source[index];
		if (character === '"' || character === "'") {
			index = readCssString(source, index);
			continue;
		}

		if (character === '{') {
			depth += 1;
			continue;
		}

		if (character === '}') {
			depth -= 1;
			if (depth === 0) {
				return index + 1;
			}
		}
	}

	return source.length;
}

/**
 * @param {string} source
 * @param {string} delimiter
 * @returns {string[]}
 */
function splitTopLevel(source, delimiter) {
	const parts = [];
	let start = 0;
	let parenthesesDepth = 0;
	let bracketDepth = 0;

	for (let index = 0; index < source.length; index += 1) {
		const character = source[index];

		if (character === '"' || character === "'") {
			index = readCssString(source, index);
			continue;
		}

		if (character === '(') {
			parenthesesDepth += 1;
			continue;
		}

		if (character === ')') {
			parenthesesDepth = Math.max(0, parenthesesDepth - 1);
			continue;
		}

		if (character === '[') {
			bracketDepth += 1;
			continue;
		}

		if (character === ']') {
			bracketDepth = Math.max(0, bracketDepth - 1);
			continue;
		}

		if (parenthesesDepth === 0 && bracketDepth === 0 && character === delimiter) {
			parts.push(source.slice(start, index));
			start = index + 1;
		}
	}

	parts.push(source.slice(start));
	return parts;
}

/**
 * @param {string} selectorSource
 * @param {PreviewCssDiagnostic[]} diagnostics
 * @returns {string[]}
 */
function sanitizeSelectors(selectorSource, diagnostics) {
	const selectors = [];

	for (const rawSelector of splitTopLevel(selectorSource, ',')) {
		const selector = rawSelector.trim();
		if (selector.length === 0) {
			continue;
		}

		if (BLOCKED_SELECTOR_PATTERNS.some((pattern) => pattern.test(selector))) {
			diagnostics.push(createSelectorDiagnostic(selector));
			continue;
		}

		selectors.push(selector);
	}

	return selectors;
}

/**
 * @param {string} declarationSource
 * @param {PreviewCssDiagnostic[]} diagnostics
 * @returns {string[]}
 */
function sanitizeDeclarations(declarationSource, diagnostics) {
	const declarations = [];

	for (const rawDeclaration of splitTopLevel(declarationSource, ';')) {
		const declaration = rawDeclaration.trim();
		if (declaration.length === 0) {
			continue;
		}

		const separatorIndex = findTopLevelDelimiter(declaration, 0, new Set([':']));
		if (separatorIndex === -1) {
			continue;
		}

		const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
		const value = declaration.slice(separatorIndex + 1).trim();

		if (property.length === 0 || value.length === 0) {
			continue;
		}

		if (
			BLOCKED_PROPERTIES.has(property) ||
			property.endsWith('z-index') ||
			property.includes('pointer-events') ||
			property.includes('transform') ||
			property.startsWith('animation-') ||
			property.startsWith('transition-')
		) {
			diagnostics.push(createDeclarationDiagnostic(property, value));
			continue;
		}

		if (property === 'position' && /\bfixed\b/i.test(value)) {
			diagnostics.push(createDeclarationDiagnostic(property, value));
			continue;
		}

		if (/url\s*\(/i.test(value)) {
			diagnostics.push(createDeclarationDiagnostic(property, value, 'value'));
			continue;
		}

		declarations.push(`${property}: ${value}`);
	}

	return declarations;
}

/**
 * @param {string} css
 * @returns {{ css: string; diagnostics: PreviewCssDiagnostic[] }}
 */
export function sanitizeContentComponentPreviewCss(css) {
	const source = stripCssComments(typeof css === 'string' ? css : '');
	/** @type {PreviewCssDiagnostic[]} */
	const diagnostics = [];
	/** @type {string[]} */
	const sanitizedRules = [];
	let index = 0;

	while (index < source.length) {
		while (index < source.length && /\s/.test(source[index])) {
			index += 1;
		}

		if (index >= source.length) {
			break;
		}

		if (source[index] === '@') {
			const atRuleNameMatch = source.slice(index).match(/^@([A-Za-z-]+)/);
			const atRule = atRuleNameMatch ? `@${atRuleNameMatch[1].toLowerCase()}` : '@rule';
			diagnostics.push(createAtRuleDiagnostic(atRule));
			index = skipAtRule(source, index);
			continue;
		}

		const blockStart = findTopLevelDelimiter(source, index, new Set(['{']));
		if (blockStart === -1) {
			break;
		}

		const selectorSource = source.slice(index, blockStart).trim();
		let depth = 1;
		let blockEnd = blockStart + 1;

		for (; blockEnd < source.length; blockEnd += 1) {
			const character = source[blockEnd];
			if (character === '"' || character === "'") {
				blockEnd = readCssString(source, blockEnd);
				continue;
			}

			if (character === '{') {
				depth += 1;
				continue;
			}

			if (character === '}') {
				depth -= 1;
				if (depth === 0) {
					break;
				}
			}
		}

		const declarationSource = source.slice(blockStart + 1, blockEnd);
		const selectors = sanitizeSelectors(selectorSource, diagnostics);
		const declarations = sanitizeDeclarations(declarationSource, diagnostics);

		if (selectors.length > 0 && declarations.length > 0) {
			sanitizedRules.push(`${selectors.join(', ')} { ${declarations.join('; ')}; }`);
		}

		index = blockEnd + 1;
	}

	return {
		css: sanitizedRules.join('\n'),
		diagnostics
	};
}

/**
 * @param {string} source
 * @returns {{ css: string; diagnostics: PreviewCssDiagnostic[] }}
 */
export function inspectContentComponentPreviewCssSource(source) {
	return sanitizeContentComponentPreviewCss(source);
}
