import type { ContentComponentRegistry } from './registry';

function escapeHtml(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

export function getContentComponentChipLabel(
	component: ContentComponentRegistry['components'][number]
): string {
	return (
		component.definition.editor?.toolbarLabel ??
		component.definition.name
			.split('-')
			.filter(Boolean)
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join(' ')
	);
}

export function createContentComponentChipMarkup(
	component: ContentComponentRegistry['components'][number]
): string {
	const tagName = component.definition.kind === 'block' ? 'div' : 'span';
	const className =
		component.definition.kind === 'block'
			? 'tm-content-component-chip tm-content-component-chip--block'
			: 'tm-content-component-chip tm-content-component-chip--inline';

	return `<${tagName} data-tentman-content-component-chip="${component.definition.kind}" class="${className}">${escapeHtml(getContentComponentChipLabel(component))}</${tagName}>`;
}

export function renderContentComponentChipNode(
	container: HTMLElement,
	component: ContentComponentRegistry['components'][number]
): void {
	container.innerHTML = createContentComponentChipMarkup(component);
}
