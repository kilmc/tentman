import '@vitest/browser/matchers';
import type { Locator, LocatorSelectors } from '@vitest/browser/context';
import type { Assertion, ExpectPollOptions } from 'vitest';
import type {
	Component,
	ComponentImport,
	ComponentOptions,
	Exports,
	Rerender,
	SetupOptions
} from '@testing-library/svelte-core/types';

declare module 'vitest' {
	type Promisify<O> = {
		[K in keyof O]: O[K] extends (...args: infer A) => infer R
			? O extends R
				? Promisify<O[K]>
				: (...args: A) => Promise<R>
			: O[K];
	};

	type PromisifyDomAssertion<T> = Promisify<Assertion<T>>;

	interface ExpectStatic {
		element: <T extends HTMLElement | SVGElement | null | Locator>(
			element: T,
			options?: ExpectPollOptions
		) => PromisifyDomAssertion<Awaited<HTMLElement | SVGElement | null>>;
	}
}

declare module 'vitest-browser-svelte' {
	export interface RenderResult<C extends Component> extends LocatorSelectors {
		container: HTMLElement;
		baseElement: HTMLElement;
		component: Exports<C>;
		debug: (el?: HTMLElement) => void;
		rerender: Rerender<C>;
		unmount: () => Promise<void>;
		locator: Locator;
	}

	export function cleanup(): void;

	export function render<C extends Component>(
		component: ComponentImport<C>,
		options?: ComponentOptions<C>,
		renderOptions?: SetupOptions
	): RenderResult<C> & PromiseLike<RenderResult<C>>;
}
