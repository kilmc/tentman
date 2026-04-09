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

const sidebarEditorMocks = vi.hoisted(() => {
	const backend = {
		kind: 'local' as const,
		cacheKey: 'local:docs',
		label: 'Local docs',
		supportsDraftBranches: false
	};

	const localRepoStore = createStoreState({
		status: 'ready' as const,
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		},
		backend,
		error: null
	});

	const localContentStore = createStoreState({
		status: 'ready' as const,
		backendKey: 'local:docs',
		configs: [
			{
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
					blocks: []
				}
			},
			{
				slug: 'blog',
				path: 'content/blog.tentman.json',
				config: {
					type: 'content' as const,
					id: 'blog',
					label: 'Blog Posts',
					collection: true,
					idField: 'slug',
					content: {
						mode: 'directory' as const,
						path: 'src/content/posts',
						template: 'templates/post.md'
					},
					blocks: []
				}
			}
		],
		blockConfigs: [],
		blockRegistry: null,
		blockRegistryError: null,
		rootConfig: null,
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: true,
			manifest: {
				version: 1 as const,
				content: {
					items: ['about', 'blog']
				},
				collections: {
					blog: {
						items: ['second-post', 'hello-world', 'third-post'],
						groups: [
							{
								id: 'featured',
								label: 'Featured',
								items: ['second-post']
							}
						]
					}
				}
			},
			error: null
		},
		error: null
	});

	return {
		backend,
		localRepoStore,
		localContentStore,
		refresh: vi.fn(async () => {}),
		fetchContentDocument: vi.fn(async () => [
			{ slug: 'hello-world', title: 'Hello world' },
			{ slug: 'second-post', title: 'Second post' },
			{ slug: 'third-post', title: 'Third post' }
		]),
		resolve: vi.fn((path: string) => path),
		invalidateAll: vi.fn(async () => {}),
		toasts: {
			success: vi.fn(),
			error: vi.fn()
		}
	};
});

vi.mock('$app/navigation', () => ({
	invalidateAll: sidebarEditorMocks.invalidateAll
}));

vi.mock('$app/paths', () => ({
	resolve: sidebarEditorMocks.resolve
}));

vi.mock('$app/state', () => ({
	page: {
		params: {}
	}
}));

vi.mock('$lib/content/service', () => ({
	fetchContentDocument: sidebarEditorMocks.fetchContentDocument
}));

vi.mock('$lib/stores/local-content', () => ({
	localContent: {
		subscribe: sidebarEditorMocks.localContentStore.subscribe,
		refresh: sidebarEditorMocks.refresh
	}
}));

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: {
		subscribe: sidebarEditorMocks.localRepoStore.subscribe
	}
}));

vi.mock('$lib/stores/toasts', () => ({
	toasts: sidebarEditorMocks.toasts
}));

vi.mock('$lib/utils/routing', () => ({
	buildLoginRedirect: vi.fn((path: string) => path)
}));

import PagesLayout from '../../../routes/pages/+layout.svelte';

describe('routes/pages/+layout.svelte manual navigation editor', () => {
	beforeEach(() => {
		sidebarEditorMocks.refresh.mockClear();
		sidebarEditorMocks.fetchContentDocument.mockClear();
		sidebarEditorMocks.resolve.mockClear();
		sidebarEditorMocks.invalidateAll.mockClear();
		sidebarEditorMocks.toasts.success.mockClear();
		sidebarEditorMocks.toasts.error.mockClear();
	});

	it('enters sidebar edit mode with collections collapsed, then reveals grouped and ungrouped zones when expanded', async () => {
		const screen = render(PagesLayout, {
			data: {
				isAuthenticated: false,
				user: null,
				selectedBackend: {
					kind: 'local',
					repo: {
						name: 'Docs',
						pathLabel: '~/Docs'
					}
				},
				selectedRepo: null,
				configs: [],
				blockConfigs: [],
				rootConfig: null,
				navigationManifest: {
					path: 'tentman/navigation-manifest.json',
					exists: false,
					manifest: null,
					error: null
				}
			}
		});

		await expect.element(screen.getByRole('button', { name: 'Edit navigation' })).toBeVisible();

		await screen.getByRole('button', { name: 'Edit navigation' }).click();

		await expect.element(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		await expect
			.element(screen.getByRole('button', { name: 'Expand collection' }))
			.toHaveAttribute('aria-expanded', 'false');
		await expect.element(screen.getByText('About Page')).toBeVisible();
		await expect.element(screen.getByText('Blog Posts')).toBeVisible();

		await screen.getByRole('button', { name: 'Expand collection' }).click();

		await expect
			.element(screen.getByRole('button', { name: 'Collapse collection' }))
			.toHaveAttribute('aria-expanded', 'true');
		await expect.element(screen.getByText('Featured')).toBeVisible();
		await expect.element(screen.getByText('Ungrouped')).toBeVisible();
		expect(sidebarEditorMocks.fetchContentDocument).toHaveBeenCalledTimes(2);

		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(screen.getByRole('button', { name: 'Edit navigation' })).toBeVisible();
	});
});
