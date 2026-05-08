import path from 'node:path';
import {
	discoverContentComponents,
	normalizeContentComponentInstance,
	renderContentComponent
} from '@tentman/core';

function formatNodeLocation(node) {
	const line = node?.position?.start?.line;
	const column = node?.position?.start?.column;

	if (typeof line === 'number' && typeof column === 'number') {
		return `${line}:${column}`;
	}

	return 'unknown location';
}

function getFileLabel(file) {
	return typeof file?.path === 'string' && file.path.length > 0
		? file.path
		: typeof file?.filename === 'string' && file.filename.length > 0
			? file.filename
		: typeof file?.history?.[0] === 'string' && file.history[0].length > 0
			? file.history[0]
			: '<unknown file>';
}

function getOriginalSourceMarker(file, node) {
	const source =
		typeof file?.value === 'string'
			? file.value
			: typeof file?.contents === 'string'
				? file.contents
				: '';
	const startOffset = node?.position?.start?.offset;
	const endOffset = node?.position?.end?.offset;

	if (
		typeof startOffset === 'number' &&
		typeof endOffset === 'number' &&
		startOffset >= 0 &&
		endOffset >= startOffset
	) {
		return source.slice(startOffset, endOffset);
	}

	return null;
}

function createAdapterError(message, file, node, componentName) {
	const location = formatNodeLocation(node);
	const fileLabel = getFileLabel(file);
	const componentLabel = componentName ? ` for component ${componentName}` : '';
	return new Error(`${fileLabel}:${location}${componentLabel}: ${message}`);
}

function getNodeStart(node) {
	return {
		line: node?.position?.start?.line,
		column: node?.position?.start?.column
	};
}

function addColumnOffset(location, offset) {
	return {
		line: location.line,
		column: typeof location.column === 'number' ? location.column + offset : location.column
	};
}

function withSyntheticPosition(node, location) {
	return {
		...node,
		position: {
			start: location,
			end: location
		}
	};
}

function parseDirectiveAttributes(source) {
	const attributes = {};
	const attributePattern = /([A-Za-z0-9_-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
	let lastIndex = 0;
	let match = attributePattern.exec(source);

	while (match) {
		if (match.index !== lastIndex && source.slice(lastIndex, match.index).trim().length > 0) {
			throw new Error(`Could not parse directive attributes: ${source}`);
		}

		attributes[match[1]] = match[3] ?? match[4] ?? '';
		lastIndex = match.index + match[0].length;
		match = attributePattern.exec(source);
	}

	if (source.slice(lastIndex).trim().length > 0) {
		throw new Error(`Could not parse directive attributes: ${source}`);
	}

	return attributes;
}

function parseInlineDirectiveSegments(source) {
	const directivePattern = /:([A-Za-z0-9][A-Za-z0-9-]*)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?/g;
	const segments = [];
	let lastIndex = 0;
	let match = directivePattern.exec(source);

	while (match) {
		if (match.index > lastIndex) {
			segments.push({
				type: 'text',
				value: source.slice(lastIndex, match.index)
			});
		}

		segments.push({
			type: 'directive',
			value: match[0],
			name: match[1],
			markdownLabel: match[2],
			attributes: parseDirectiveAttributes(match[3] ?? ''),
			offset: match.index
		});

		lastIndex = match.index + match[0].length;
		match = directivePattern.exec(source);
	}

	if (lastIndex < source.length) {
		segments.push({
			type: 'text',
			value: source.slice(lastIndex)
		});
	}

	return segments;
}

function parseBlockDirective(source) {
	const trimmedSource = source.trim();
	const match = trimmedSource.match(
		/^::([A-Za-z0-9][A-Za-z0-9-]*)(?:\[([^\]]*)\])?(?:\{([^}]*)\})?$/
	);

	if (!match) {
		return null;
	}

	return {
		raw: match[0],
		name: match[1],
		markdownLabel: match[2],
		attributes: parseDirectiveAttributes(match[3] ?? '')
	};
}

function buildInlineChildrenFromSegments(segments, renderSegment) {
	const children = [];

	for (const segment of segments) {
		if (segment.type === 'text') {
			if (segment.value.length > 0) {
				children.push({
					type: 'text',
					value: segment.value
				});
			}
			continue;
		}

		children.push({
			type: 'html',
			value: renderSegment(segment)
		});
	}

	return children;
}

function resolveComponentsDir(componentsDir) {
	return path.resolve(process.cwd(), componentsDir ?? './src/lib/content-components');
}

function walkTree(node, visitor) {
	if (!node || typeof node !== 'object') {
		return;
	}

	visitor(node);

	if (!Array.isArray(node.children)) {
		return;
	}

	for (const child of node.children) {
		walkTree(child, visitor);
	}
}

export function tentmanComponents(options = {}) {
	const onError = options.onError ?? 'throw';
	if (onError !== 'throw' && onError !== 'warn') {
		throw new Error('tentmanComponents onError must be "throw" or "warn"');
	}

	const templateEngine = options.templateEngine ?? 'nunjucks';
	if (templateEngine !== 'nunjucks') {
		throw new Error('tentmanComponents templateEngine must be "nunjucks"');
	}

	const componentsPromise = discoverContentComponents({
		componentsDir: resolveComponentsDir(options.componentsDir),
		onError
	}).then((components) => {
		const byName = new Map();

		for (const component of components) {
			byName.set(component.definition.name, component);
		}

		return byName;
	});

	return function attacher() {
		return async function transform(tree, file) {
			const componentsByName = await componentsPromise;

			walkTree(tree, (node) => {
				const original = getOriginalSourceMarker(file, node);

				if (
					(node.type === 'leafDirective' ||
						node.type === 'containerDirective' ||
						node.type === 'paragraph') &&
					original?.trim().startsWith('::')
				) {
					const directive = parseBlockDirective(original);
					if (!directive) {
						return;
					}

					try {
						const component = componentsByName.get(directive.name);
						if (!component) {
							throw createAdapterError(
								`Unknown content component name: ${directive.name}`,
								file,
								node,
								directive.name
							);
						}

						if (component.definition.kind !== 'block') {
							throw createAdapterError(
								`Component kind ${component.definition.kind} cannot be used as a block directive`,
								file,
								node,
								component.definition.name
							);
						}

						const instance = normalizeContentComponentInstance(component, {
							markdownLabel: directive.markdownLabel,
							attributes: directive.attributes
						});

						node.type = 'html';
						node.value = renderContentComponent(component, instance, 'render');
						delete node.children;
					} catch (error) {
						const enrichedError =
							error instanceof Error && error.message.includes(getFileLabel(file))
								? error
								: createAdapterError(
										error instanceof Error ? error.message : String(error),
										file,
										node,
										directive.name
									);

						if (onError === 'warn') {
							if (typeof file?.message === 'function') {
								file.message(enrichedError.message, node);
							} else {
								console.warn(enrichedError.message);
							}

							node.type = 'html';
							node.value = original;
							delete node.children;
							return;
						}

						throw enrichedError;
					}

					return;
				}

				if (node.type !== 'paragraph') {
					return;
				}

				if (!original || !original.includes(':')) {
					return;
				}

				const segments = parseInlineDirectiveSegments(original);
				if (!segments.some((segment) => segment.type === 'directive')) {
					return;
				}

				const paragraphStart = getNodeStart(node);

				try {
					node.children = buildInlineChildrenFromSegments(segments, (segment) => {
						const component = componentsByName.get(segment.name);
						const segmentNode = withSyntheticPosition(node, addColumnOffset(paragraphStart, segment.offset));

						if (!component) {
							throw createAdapterError(
								`Unknown content component name: ${segment.name}`,
								file,
								segmentNode,
								segment.name
							);
						}

						if (component.definition.kind !== 'inline') {
							throw createAdapterError(
								`Component kind ${component.definition.kind} cannot be used as inline directive text`,
								file,
								segmentNode,
								component.definition.name
							);
						}

						const instance = normalizeContentComponentInstance(component, {
							markdownLabel: segment.markdownLabel,
							attributes: segment.attributes
						});

						return renderContentComponent(component, instance, 'render');
					});
				} catch (error) {
					const firstDirectiveName = segments.find((segment) => segment.type === 'directive')?.name;
					const enrichedError =
						error instanceof Error && error.message.includes(getFileLabel(file))
							? error
							: createAdapterError(
									error instanceof Error ? error.message : String(error),
									file,
									node,
									firstDirectiveName
								);

					if (onError === 'warn') {
						if (typeof file?.message === 'function') {
							file.message(enrichedError.message, node);
						} else {
							console.warn(enrichedError.message);
						}

						node.children = [
							{
								type: 'html',
								value: original
							}
						];

						return;
					}

					throw enrichedError;
				}
			});
		};
	};
}
