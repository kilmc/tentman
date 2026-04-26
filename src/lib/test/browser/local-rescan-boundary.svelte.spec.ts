import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		},
		set(nextValue: T) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		}
	};
}

const boundaryMocks = vi.hoisted(() => {
	const aboutConfigWithDimensions = {
		slug: 'about',
		path: 'content/about.tentman.json',
		config: {
			type: 'content' as const,
			id: 'about',
			label: 'About Page',
			content: {
				mode: 'file' as const,
				path: 'src/content/about.json'
			},
			blocks: [
				{ id: 'width', type: 'text' as const, label: 'Width' },
				{ id: 'height', type: 'text' as const, label: 'Height' }
			]
		}
	};
	const aboutConfigWithoutDimensions = {
		slug: 'about',
		path: 'content/about.tentman.json',
		config: {
			type: 'content' as const,
			id: 'about',
			label: 'About Page',
			content: {
				mode: 'file' as const,
				path: 'src/content/about.json'
			},
			blocks: [{ id: 'caption', type: 'text' as const, label: 'Caption' }]
		}
	};

	const localContentReadyState = {
		status: 'ready' as const,
		backendKey: 'local:docs',
		configs: [aboutConfigWithDimensions] as unknown[],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: null,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: false,
			manifest: null,
			error: null
		},
		instructionDiscovery: {
			instructions: [],
			issues: []
		},
		error: null
	};

	const localContentStore = createStoreState(localContentReadyState);
	const refresh = vi.fn(async () => {
		localContentStore.set({
			...localContentReadyState,
			configs: [aboutConfigWithoutDimensions] as unknown[]
		});
	});

	return {
		localContentReadyState,
		localContentStore,
		refresh
	};
});

vi.mock('$lib/stores/local-content', () => ({
	localContent: {
		subscribe: boundaryMocks.localContentStore.subscribe,
		refresh: boundaryMocks.refresh
	}
}));

import LocalRescanBoundaryHarness from '$lib/test/fixtures/LocalRescanBoundaryHarness.svelte';

describe('local rescan remount boundary', () => {
	beforeEach(() => {
		boundaryMocks.refresh.mockClear();
		boundaryMocks.localContentStore.set(boundaryMocks.localContentReadyState);
	});

	it('remounts stale local config snapshots after rescan', async () => {
		const screen = render(LocalRescanBoundaryHarness);

		await expect.element(screen.getByText('Width')).toBeVisible();
		await expect.element(screen.getByText('Height')).toBeVisible();
		await expect.element(screen.getByText('Caption')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Rescan repo' }).click();

		expect(boundaryMocks.refresh).toHaveBeenCalledWith({ force: true });
		await expect.element(screen.getByText('Caption')).toBeVisible();
		await expect.element(screen.getByText('Width')).not.toBeInTheDocument();
		await expect.element(screen.getByText('Height')).not.toBeInTheDocument();
	});
});
