import { describe, expect, it } from 'vitest';
import Page from './+page.svelte';

describe('/+page.svelte', () => {
	it('should export a page component', () => {
		expect(Page).toBeTruthy();
	});
});
