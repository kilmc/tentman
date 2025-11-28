/**
 * Keyboard shortcut utilities
 */

export interface KeyboardShortcut {
	key: string;
	ctrl?: boolean;
	meta?: boolean;
	shift?: boolean;
	alt?: boolean;
	callback: (event: KeyboardEvent) => void;
}

/**
 * Check if a keyboard event matches a shortcut definition
 */
function matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
	if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false;
	if (!!event.ctrlKey !== !!shortcut.ctrl) return false;
	if (!!event.metaKey !== !!shortcut.meta) return false;
	if (!!event.shiftKey !== !!shortcut.shift) return false;
	if (!!event.altKey !== !!shortcut.alt) return false;
	return true;
}

/**
 * Register keyboard shortcuts
 * Returns a cleanup function to remove event listeners
 */
export function registerKeyboardShortcuts(shortcuts: KeyboardShortcut[]): () => void {
	const handler = (event: KeyboardEvent) => {
		// Ignore keyboard shortcuts when typing in inputs
		const target = event.target as HTMLElement;
		if (
			target.tagName === 'INPUT' ||
			target.tagName === 'TEXTAREA' ||
			target.isContentEditable
		) {
			return;
		}

		for (const shortcut of shortcuts) {
			if (matchesShortcut(event, shortcut)) {
				event.preventDefault();
				shortcut.callback(event);
				break;
			}
		}
	};

	window.addEventListener('keydown', handler);

	return () => {
		window.removeEventListener('keydown', handler);
	};
}

/**
 * Format keyboard shortcut for display
 */
export function formatShortcut(shortcut: Omit<KeyboardShortcut, 'callback'>): string {
	const parts: string[] = [];

	// Mac uses Cmd, Windows/Linux use Ctrl
	const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

	if (shortcut.ctrl || shortcut.meta) {
		parts.push(isMac ? '⌘' : 'Ctrl');
	}
	if (shortcut.shift) {
		parts.push(isMac ? '⇧' : 'Shift');
	}
	if (shortcut.alt) {
		parts.push(isMac ? '⌥' : 'Alt');
	}
	parts.push(shortcut.key.toUpperCase());

	return parts.join(isMac ? '' : '+');
}
