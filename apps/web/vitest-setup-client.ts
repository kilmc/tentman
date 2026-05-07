/// <reference types="@vitest/browser/matchers" />
/// <reference types="@vitest/browser/providers/playwright" />

import { afterEach, vi } from 'vitest';

afterEach(() => {
	if (document.activeElement instanceof HTMLElement) {
		document.activeElement.blur();
	}

	for (const selector of [
		'[role="dialog"]',
		'[data-scroll-locked]',
		'[data-bits-ui-portal]',
		'[data-radix-popper-content-wrapper]'
	]) {
		for (const element of document.querySelectorAll(selector)) {
			element.remove();
		}
	}

	document.body.style.overflow = '';
	document.documentElement.style.overflow = '';
	vi.restoreAllMocks();
});
