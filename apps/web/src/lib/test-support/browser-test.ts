import { expect } from 'vitest';
import { render as browserRender } from 'vitest-browser-svelte';

export const render = browserRender as unknown as (
	...args: Parameters<typeof browserRender>
) => Promise<any>;

export function expectElement(element: unknown) {
	return expect(element as never) as any;
}
