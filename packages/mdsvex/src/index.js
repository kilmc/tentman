import path from 'node:path';
import {
	discoverContentComponents,
	loadTentmanProject,
	resolveContentComponentRenderTarget,
	resolveTentmanMarkdownFileRenderContext,
	normalizeContentComponentInstance,
	renderContentComponent
} from '@tentman/core';

function serializeSveltePropValue(value) {
	return JSON.stringify(value);
}

function renderMdsvexTarget(component, instance, renderOptions = {}) {
	const renderTarget = resolveContentComponentRenderTarget(component, instance, 'mdsvex', renderOptions);
	if (!renderTarget) {
		return null;
	}

	const props = Object.entries(renderTarget.props)
		.map(
			([propName, propValue]) =>
				`${propName}={${serializeSveltePropValue(propValue)}}`
		)
		.join(' ');

	return {
		importName: renderTarget.component,
		importPath: renderTarget.from,
		markup: `<${renderTarget.component}${props ? ` ${props}` : ''} />`
	};
}

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

function resolveComponentsDir(projectRoot, componentsDir) {
	return path.resolve(projectRoot, componentsDir ?? './src/lib/content-components');
}

function resolveTentmanFilePath(projectRoot, file) {
	const candidate =
		typeof file?.path === 'string' && file.path.length > 0
			? file.path
			: typeof file?.filename === 'string' && file.filename.length > 0
				? file.filename
				: typeof file?.history?.[0] === 'string' && file.history[0].length > 0
					? file.history[0]
					: null;

	if (!candidate) {
		return null;
	}

	return path.isAbsolute(candidate) ? candidate : path.resolve(projectRoot, candidate);
}

function addMdsvexImport(file, importName, importPath) {
	if (!file || typeof file !== 'object') {
		return;
	}

	const existingImports = Array.isArray(file.data?.tentmanComponentImports)
		? file.data.tentmanComponentImports
		: [];
	if (existingImports.some((entry) => entry.importName === importName && entry.importPath === importPath)) {
		return;
	}

	file.data ??= {};
	file.data.tentmanComponentImports = [
		...existingImports,
		{
			importName,
			importPath
		}
	];
}

function prependMdsvexImports(tree, file) {
	const imports = Array.isArray(file?.data?.tentmanComponentImports)
		? file.data.tentmanComponentImports
		: [];
	if (imports.length === 0 || !Array.isArray(tree.children)) {
		return;
	}

	const importBlock = `<script>\n${imports
		.map(({ importName, importPath }) => `import ${importName} from '${importPath}';`)
		.join('\n')}\n</script>`;

	tree.children.unshift({
		type: 'html',
		value: importBlock
	});
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

	const resolveTentmanContext = options.resolveTentmanContext ?? 'off';
	if (resolveTentmanContext !== 'off' && resolveTentmanContext !== 'auto') {
		throw new Error('tentmanComponents resolveTentmanContext must be "off" or "auto"');
	}

	const projectRoot = path.resolve(options.projectRoot ?? process.cwd());

	const componentsPromise = discoverContentComponents({
		componentsDir: resolveComponentsDir(projectRoot, options.componentsDir),
		onError
	}).then((components) => {
		const byName = new Map();

		for (const component of components) {
			byName.set(component.definition.name, component);
		}

		return byName;
	});
	const projectPromise =
		resolveTentmanContext === 'auto' ? loadTentmanProject(projectRoot) : Promise.resolve(null);

	return function attacher() {
		return async function transform(tree, file) {
			const componentsByName = await componentsPromise;
			const autoRenderOptions =
				resolveTentmanContext === 'auto'
					? (() => {
							const absoluteFilePath = resolveTentmanFilePath(projectRoot, file);
							if (!absoluteFilePath) {
								return null;
							}

							return projectPromise.then((project) =>
								project
									? resolveTentmanMarkdownFileRenderContext(project, absoluteFilePath)
									: null
							);
						})()
					: null;
			const renderOptions = {
				...((await autoRenderOptions) ?? {}),
				...((await options.resolveRenderOptions?.(file)) ?? {})
			};

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
						const mdsvexTarget = renderMdsvexTarget(component, instance, renderOptions);

						node.type = 'html';
						node.value =
							mdsvexTarget?.markup ??
							renderContentComponent(component, instance, renderOptions);
						if (mdsvexTarget) {
							addMdsvexImport(file, mdsvexTarget.importName, mdsvexTarget.importPath);
						}
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
						const mdsvexTarget = renderMdsvexTarget(component, instance, renderOptions);
						if (mdsvexTarget) {
							addMdsvexImport(file, mdsvexTarget.importName, mdsvexTarget.importPath);
						}

						return (
							mdsvexTarget?.markup ??
							renderContentComponent(component, instance, renderOptions)
						);
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

			prependMdsvexImports(tree, file);
		};
	};
}
