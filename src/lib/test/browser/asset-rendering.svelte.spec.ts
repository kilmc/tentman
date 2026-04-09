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
		}
	};
}

const assetRenderingMocks = vi.hoisted(() => ({
	resolveUrl: vi.fn(),
	readFile: vi.fn(),
	create: vi.fn(),
	delete: vi.fn(),
	getMetadata: vi.fn(),
	getMetadataForContent: vi.fn(),
	collectFromContent: vi.fn(),
	gc: vi.fn()
}));

const localContentState = vi.hoisted(() =>
	createStoreState({
		rootConfig: null
	})
);

vi.mock('$lib/features/draft-assets/store', () => ({
	draftAssetStore: {
		resolveUrl: assetRenderingMocks.resolveUrl,
		readFile: assetRenderingMocks.readFile,
		create: assetRenderingMocks.create,
		delete: assetRenderingMocks.delete,
		getMetadata: assetRenderingMocks.getMetadata,
		getMetadataForContent: assetRenderingMocks.getMetadataForContent,
		collectFromContent: assetRenderingMocks.collectFromContent,
		gc: assetRenderingMocks.gc
	}
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: {
		subscribe: localContentState.subscribe
	}
}));

import ItemCard from '$lib/components/ItemCard.svelte';
import ContentValueDisplay from '$lib/components/content/ContentValueDisplay.svelte';

describe('shared draft asset rendering surfaces', () => {
	beforeEach(() => {
		assetRenderingMocks.resolveUrl.mockReset();
		assetRenderingMocks.readFile.mockReset();
		assetRenderingMocks.create.mockReset();
		assetRenderingMocks.delete.mockReset();
		assetRenderingMocks.getMetadata.mockReset();
		assetRenderingMocks.getMetadataForContent.mockReset();
		assetRenderingMocks.collectFromContent.mockReset();
		assetRenderingMocks.gc.mockReset();
		assetRenderingMocks.resolveUrl.mockResolvedValue('data:image/png;base64,cmVuZGVyZWQ=');
	});

	it('renders staged draft refs in content display image blocks', async () => {
		const screen = render(ContentValueDisplay, {
			block: {
				id: 'hero',
				type: 'image',
				label: 'Hero',
				assetsDir: 'static/images'
			},
			value: 'draft-asset:hero',
			blockRegistry: new Map() as never
		});

		await expect.element(screen.getByRole('img', { name: 'Hero' })).toBeVisible();
		await expect.element(screen.getByText('draft-asset:hero')).toBeVisible();
	});

	it('renders markdown blocks as formatted content instead of raw markdown text', async () => {
		const screen = render(ContentValueDisplay, {
			block: {
				id: 'body',
				type: 'markdown',
				label: 'Body'
			},
			value: '# Hello world\n\nThis is **bold** text.',
			blockRegistry: new Map() as never
		});

		await expect.element(screen.getByRole('heading', { name: 'Hello world' })).toBeVisible();
		await expect.element(screen.getByText('bold')).toBeVisible();
		await expect.element(screen.getByText('This is')).toBeVisible();
	});

	it('renders staged draft refs in item cards', async () => {
		const screen = render(ItemCard, {
			item: {
				title: 'Hello world',
				hero: 'draft-asset:hero'
			},
			href: '/pages/posts/hello-world',
			cardFields: {
				primary: [
					{
						id: 'title',
						type: 'text',
						label: 'Title'
					}
				],
				secondary: [
					{
						id: 'hero',
						type: 'image',
						label: 'Hero',
						assetsDir: 'static/images'
					}
				]
			}
		});

		await expect.element(screen.getByRole('img', { name: 'Hero' })).toBeVisible();
		await expect.element(screen.getByText('Hello world')).toBeVisible();
	});
});
