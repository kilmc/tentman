import { describe, expect, it } from 'vitest';
import {
	getMarkdownEditorContentComponentAvailableActions,
	getMarkdownEditorContentComponentCapabilities,
	getMarkdownEditorContentComponentPrimaryAction
} from './content-component-interactions';

describe('content component interaction resolution', () => {
	it('returns no primary action for marker-only components without affordances', () => {
		const capabilities = getMarkdownEditorContentComponentCapabilities({
			canEdit: false,
			canJump: false
		});

		expect(getMarkdownEditorContentComponentAvailableActions(capabilities)).toEqual([]);
		expect(getMarkdownEditorContentComponentPrimaryAction(capabilities)).toBe('none');
	});

	it('jumps marker-only reference components directly', () => {
		const capabilities = getMarkdownEditorContentComponentCapabilities({
			canEdit: false,
			canJump: true
		});

		expect(getMarkdownEditorContentComponentAvailableActions(capabilities)).toEqual(['jump']);
		expect(getMarkdownEditorContentComponentPrimaryAction(capabilities)).toBe('jump');
	});

	it('opens editable-only components in the dialog even when they expose an href', () => {
		const capabilities = getMarkdownEditorContentComponentCapabilities({
			canEdit: true,
			canJump: false,
			href: 'https://example.com/buy'
		});

		expect(getMarkdownEditorContentComponentAvailableActions(capabilities)).toEqual([
			'edit',
			'openHref'
		]);
		expect(getMarkdownEditorContentComponentPrimaryAction(capabilities)).toBe('edit');
	});

	it('routes editable reference components to the action chooser', () => {
		const capabilities = getMarkdownEditorContentComponentCapabilities({
			canEdit: true,
			canJump: true,
			href: 'https://example.com/gallery'
		});

		expect(getMarkdownEditorContentComponentAvailableActions(capabilities)).toEqual([
			'edit',
			'jump',
			'openHref'
		]);
		expect(getMarkdownEditorContentComponentPrimaryAction(capabilities)).toBe('openActions');
	});

	it('prioritizes repair/edit for broken editable components', () => {
		const capabilities = getMarkdownEditorContentComponentCapabilities({
			canEdit: true,
			canJump: false,
			broken: true
		});

		expect(getMarkdownEditorContentComponentPrimaryAction(capabilities)).toBe('edit');
	});
});
