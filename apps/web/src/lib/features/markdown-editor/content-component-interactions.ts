import type { ContentComponentToolbarButton } from '$lib/components/form/markdown-field-toolbar';

interface ContentComponentLikeNode {
	type: {
		name: string;
	};
	attrs?: Record<string, unknown>;
}

export type MarkdownEditorContentComponentDirectIntent = 'edit' | 'jump' | 'openHref';
export type MarkdownEditorContentComponentIntent =
	| MarkdownEditorContentComponentDirectIntent
	| 'openActions'
	| 'none';

export interface MarkdownEditorContentComponentCapabilities {
	canEdit: boolean;
	canJump: boolean;
	canOpenHref: boolean;
	isBroken: boolean;
	isMarkerOnly: boolean;
}

export interface MarkdownEditorContentComponentActivationRequest {
	nodeTypeName: string;
	nodePos: number;
	nodeAttributes: Record<string, unknown>;
	href: string;
	broken: boolean;
	rect: DOMRect | null;
}

export function getMarkdownEditorContentComponentToolbarButton(
	nodeTypeName: string,
	componentToolbarButtons: ContentComponentToolbarButton[]
): ContentComponentToolbarButton | null {
	return (
		componentToolbarButtons.find((button) => button.contentComponent?.nodeName === nodeTypeName) ??
		null
	);
}

export function isMarkdownEditorContentComponentNode(
	node: ContentComponentLikeNode | null | undefined,
	componentToolbarButtons: ContentComponentToolbarButton[]
): boolean {
	return Boolean(
		node?.type?.name &&
		getMarkdownEditorContentComponentToolbarButton(node.type.name, componentToolbarButtons)
	);
}

export function createMarkdownEditorContentComponentActivationRequest(options: {
	node: ContentComponentLikeNode;
	nodePos: number;
	viewNodeDom: Node | null;
}): MarkdownEditorContentComponentActivationRequest {
	const viewNodeElement = options.viewNodeDom instanceof Element ? options.viewNodeDom : null;

	return {
		nodeTypeName: options.node.type.name,
		nodePos: options.nodePos,
		nodeAttributes: { ...(options.node.attrs ?? {}) },
		href: viewNodeElement?.getAttribute('data-tentman-content-component-href')?.trim() ?? '',
		broken: viewNodeElement?.getAttribute('data-tentman-content-component-broken') === 'true',
		rect: viewNodeElement?.getBoundingClientRect() ?? null
	};
}

export function getMarkdownEditorContentComponentCapabilities(options: {
	canEdit: boolean;
	canJump: boolean;
	href?: string | null;
	broken?: boolean;
	isMarkerOnly?: boolean;
}): MarkdownEditorContentComponentCapabilities {
	return {
		canEdit: options.canEdit,
		canJump: options.canJump,
		canOpenHref: Boolean(options.href?.trim()),
		isBroken: options.broken ?? false,
		isMarkerOnly: options.isMarkerOnly ?? !options.canEdit
	};
}

export function getMarkdownEditorContentComponentAvailableActions(
	capabilities: MarkdownEditorContentComponentCapabilities
): MarkdownEditorContentComponentDirectIntent[] {
	const actions: MarkdownEditorContentComponentDirectIntent[] = [];

	if (capabilities.canEdit) {
		actions.push('edit');
	}

	if (capabilities.canJump) {
		actions.push('jump');
	}

	if (capabilities.canOpenHref) {
		actions.push('openHref');
	}

	return actions;
}

export function getMarkdownEditorContentComponentPrimaryAction(
	capabilities: MarkdownEditorContentComponentCapabilities
): MarkdownEditorContentComponentIntent {
	if (capabilities.isBroken && capabilities.canEdit) {
		return 'edit';
	}

	const activationActions: MarkdownEditorContentComponentDirectIntent[] = [];

	if (capabilities.canEdit) {
		activationActions.push('edit');
	}

	if (capabilities.canJump) {
		activationActions.push('jump');
	}

	if (activationActions.length === 0) {
		return capabilities.canOpenHref ? 'openHref' : 'none';
	}

	return activationActions.length === 1 ? activationActions[0] : 'openActions';
}
