import {
	collectContentComponentReferenceIndex,
	getContentComponentReferenceAttribute,
	parseContentComponentReferenceBinding
} from './content-components.js';

function createDiagnostic(level, code, message, details = {}) {
	return { level, code, message, ...details };
}

function getReferenceBindings(value) {
	if (typeof value === 'string') {
		const normalized = value.trim();
		return normalized.length > 0 ? [normalized] : [];
	}

	if (Array.isArray(value)) {
		return value.flatMap((entry) => {
			if (typeof entry !== 'string') {
				return [];
			}

			const normalized = entry.trim();
			return normalized.length > 0 ? [normalized] : [];
		});
	}

	return [];
}

function getItemLabel(item, index) {
	if (!item || typeof item !== 'object' || Array.isArray(item)) {
		return `item ${index + 1}`;
	}

	return item.title ?? item.label ?? item.slug ?? item.filename ?? `item ${index + 1}`;
}

function getItemPath(owner, item) {
	if (item && typeof item === 'object' && !Array.isArray(item)) {
		if (typeof item.__tentmanSourcePath === 'string' && item.__tentmanSourcePath.length > 0) {
			return item.__tentmanSourcePath;
		}
	}

	return owner.contentPath ?? owner.path;
}

function walkBlocks(blocks, resolveStructuredBlocks, visit) {
	if (!Array.isArray(blocks)) {
		return;
	}

	for (const block of blocks) {
		if (!block || typeof block !== 'object' || Array.isArray(block)) {
			continue;
		}

		visit(block);

		const nestedBlocks = resolveStructuredBlocks(block);
		if (Array.isArray(nestedBlocks)) {
			walkBlocks(nestedBlocks, resolveStructuredBlocks, visit);
		}
	}
}

export function validateContentComponentReferenceBindings(options) {
	const componentById = new Map(
		(options.components ?? []).map((component) => [component.definition.id, component])
	);
	const diagnostics = [];
	const resolveStructuredBlocks = options.resolveStructuredBlocks ?? ((block) => block.blocks ?? null);

	for (const owner of options.blockTrees ?? []) {
		walkBlocks(owner.blocks, resolveStructuredBlocks, (block) => {
			const structuredBlocks = resolveStructuredBlocks(block);

			for (const binding of getReferenceBindings(block.referenceFor)) {
				const parsedBinding = parseContentComponentReferenceBinding(binding);
				const componentId = parsedBinding.componentId;
				const attributeId = parsedBinding.attributeId ?? '';
				const component = componentById.get(componentId);

				if (!component) {
					diagnostics.push(
						createDiagnostic(
							'error',
							'content-components.reference-binding.missing-component',
							`${owner.label} declares referenceFor "${binding}" on block "${block.id}" but content component "${componentId}" was not discovered`,
							{
								path: owner.path,
								blockId: block.id,
								binding,
								componentId,
								attributeId
							}
						)
					);
					continue;
				}

				if (parsedBinding.kind === 'marker') {
					if (!structuredBlocks) {
						diagnostics.push(
							createDiagnostic(
								'error',
								'content-components.reference-binding.marker-on-primitive',
								`${owner.label} declares marker-only referenceFor "${binding}" on block "${block.id}" but marker-only bindings are only supported on structured block sources`,
								{
									path: owner.path,
									blockId: block.id,
									binding,
									componentId
								}
							)
						);
						continue;
					}

					if (getContentComponentReferenceAttribute(component)) {
						diagnostics.push(
							createDiagnostic(
								'error',
								'content-components.reference-binding.marker-requires-nonselector-component',
								`${owner.label} declares marker-only referenceFor "${binding}" on block "${block.id}" but content component "${componentId}" declares a selector reference attribute`,
								{
									path: owner.path,
									blockId: block.id,
									binding,
									componentId
								}
							)
						);
					}

					continue;
				}

				if (structuredBlocks) {
					diagnostics.push(
						createDiagnostic(
							'error',
							'content-components.reference-binding.selector-on-structured',
							`${owner.label} declares selector referenceFor "${binding}" on block "${block.id}" but selector bindings are only supported on primitive string-valued source fields`,
							{
								path: owner.path,
								blockId: block.id,
								binding,
								componentId,
								attributeId
							}
						)
					);
					continue;
				}

				const attribute = component.definition.attributes[attributeId];
				if (!attribute) {
					diagnostics.push(
						createDiagnostic(
							'error',
							'content-components.reference-binding.missing-attribute',
							`${owner.label} declares referenceFor "${binding}" on block "${block.id}" but content component "${componentId}" has no "${attributeId}" attribute`,
							{
								path: owner.path,
								blockId: block.id,
								binding,
								componentId,
								attributeId
							}
						)
					);
					continue;
				}

				if (attribute.reference !== true) {
					diagnostics.push(
						createDiagnostic(
							'error',
							'content-components.reference-binding.non-reference-attribute',
							`${owner.label} declares referenceFor "${binding}" on block "${block.id}" but content component "${componentId}.${attributeId}" is not a reference attribute`,
							{
								path: owner.path,
								blockId: block.id,
								binding,
								componentId,
								attributeId
							}
						)
					);
				}
			}
		});

		for (const [index, contentItem] of (owner.contentItems ?? []).entries()) {
			const duplicateState = collectContentComponentReferenceIndex({
				blocks: owner.blocks,
				contentItem,
				resolveStructuredBlocks
			});

			for (const error of duplicateState.errors) {
				diagnostics.push(
					createDiagnostic(
						'error',
						'content-components.reference-binding.duplicate-token',
						`${owner.label} ${getItemLabel(contentItem, index)} has duplicate reference bindings: ${error}`,
						{
							path: getItemPath(owner, contentItem),
							index,
							itemLabel: getItemLabel(contentItem, index)
						}
					)
				);
			}
		}
	}

	return diagnostics;
}
