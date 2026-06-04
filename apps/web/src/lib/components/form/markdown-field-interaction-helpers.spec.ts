import { describe, expect, it } from 'vitest';
import { getMarkdownFieldContextualPopoverState } from './markdown-field-controller';
import { getMarkdownFieldEditorHostClickResult } from './markdown-field-popover';
import type { MarkdownFieldSelectedContentComponentState } from './markdown-field-content-component-selection';
import type { ContentComponentToolbarButton } from './markdown-field-toolbar';
import type { Editor } from '@tiptap/core';

class TestElement {
	dataset: Record<string, string> = {};

	getBoundingClientRect(): DOMRect {
		return new DOMRect(0, 0, 0, 0);
	}

	closest(): Element | null {
		return null;
	}
}

class TestHTMLElement extends TestElement {}

class TestDOMRect {
	constructor(
		public x: number,
		public y: number,
		public width: number,
		public height: number
	) {}

	get left(): number {
		return this.x;
	}

	get top(): number {
		return this.y;
	}

	get right(): number {
		return this.x + this.width;
	}

	get bottom(): number {
		return this.y + this.height;
	}
}

Object.assign(globalThis, {
	Element: TestElement,
	HTMLElement: TestHTMLElement,
	DOMRect: TestDOMRect,
	window: {
		innerWidth: 1280
	}
});

function createComponentItem(
	overrides: Partial<ContentComponentToolbarButton> = {}
): ContentComponentToolbarButton {
	return {
		id: 'project-gallery',
		label: 'Project Gallery',
		buttonLabel: 'Project Gallery',
		contentComponent: {
			nodeName: 'contentComponentProjectGallery',
			componentName: 'project-gallery',
			hasEditableFields: true,
			reference: {
				attributeId: 'galleryId',
				binding: 'project-gallery:galleryId'
			}
		},
		...overrides
	};
}

function createSelectedContentComponentState(
	overrides: Partial<MarkdownFieldSelectedContentComponentState> = {}
): MarkdownFieldSelectedContentComponentState {
	const item = overrides.item ?? createComponentItem();

	return {
		item,
		href: '',
		broken: false,
		canEdit: true,
		referenceTarget: null,
		capabilities: {
			canEdit: true,
			canJump: true,
			canOpenHref: false,
			isBroken: false,
			isMarkerOnly: false
		},
		availableActions: ['edit', 'jump'],
		primaryAction: 'openActions',
		...overrides
	};
}

function createEditorStub(options: {
	selectionNode?: { attrs?: Record<string, unknown> } | null;
	nodeDom?: unknown;
	isLinkActive?: boolean;
	linkHref?: string;
	coordsRect?: { left: number; right: number; top: number; bottom: number };
}): Editor {
	const selectionNode = options.selectionNode ?? null;
	const coordsRect = options.coordsRect ?? { left: 20, right: 60, top: 40, bottom: 52 };

	return {
		state: {
			selection: {
				from: 3,
				to: 3,
				node: selectionNode
			}
		},
		view: {
			nodeDOM: () => options.nodeDom ?? null,
			coordsAtPos: () => coordsRect
		},
		isActive: (name: string) => name === 'link' && Boolean(options.isLinkActive),
		getAttributes: () => ({ href: options.linkHref ?? '' })
	} as unknown as Editor;
}

describe('markdown field interaction helpers', () => {
	it('opens a component action popover only for openActions nodes', () => {
		const nodeDom = new TestHTMLElement();
		nodeDom.dataset.tentmanContentComponentBroken = 'false';
		nodeDom.getBoundingClientRect = () => new DOMRect(100, 120, 80, 24);
		const editor = createEditorStub({
			selectionNode: { attrs: { href: 'https://example.com/gallery' } },
			nodeDom
		});

		const state = getMarkdownFieldContextualPopoverState({
			editor,
			selectedContentComponentState: createSelectedContentComponentState()
		});

		expect(state).toMatchObject({
			kind: 'component',
			href: 'https://example.com/gallery',
			broken: false
		});
		expect(state?.editItem?.id).toBe('project-gallery');
	});

	it('does not open a component action popover for direct actions', () => {
		const nodeDom = new TestHTMLElement();
		nodeDom.getBoundingClientRect = () => new DOMRect(100, 120, 80, 24);
		const editor = createEditorStub({
			selectionNode: { attrs: {} },
			nodeDom
		});

		const state = getMarkdownFieldContextualPopoverState({
			editor,
			selectedContentComponentState: createSelectedContentComponentState({
				primaryAction: 'edit',
				availableActions: ['edit'],
				referenceTarget: null,
				capabilities: {
					canEdit: true,
					canJump: false,
					canOpenHref: false,
					isBroken: false,
					isMarkerOnly: false
				}
			})
		});

		expect(state).toBeNull();
	});

	it('ignores editor-host clicks when there is no contextual popover to open', () => {
		const event = {
			metaKey: false,
			ctrlKey: false,
			target: null
		} as MouseEvent;
		const editor = createEditorStub({
			selectionNode: { attrs: {} },
			nodeDom: new TestHTMLElement()
		});

		const result = getMarkdownFieldEditorHostClickResult({
			event,
			hasOpenDialog: false,
			destroyed: false,
			editor,
			selectedContentComponentState: createSelectedContentComponentState({
				primaryAction: 'jump',
				availableActions: ['jump'],
				canEdit: false,
				capabilities: {
					canEdit: false,
					canJump: true,
					canOpenHref: false,
					isBroken: false,
					isMarkerOnly: true
				}
			})
		});

		expect(result).toEqual({ kind: 'ignore' });
	});
});
