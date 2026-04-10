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
					itemLabel: 'Blog Post',
					content: {
						mode: 'directory' as const,
						path: 'src/content/posts',
						template: 'templates/post.md'
					},
					blocks: [{ id: 'title', type: 'text' as const, label: 'Title' }]
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
		page: {
			params: {} as Record<string, string>,
			url: new URL('http://localhost/pages')
		},
		localRepoStore,
		localContentStore,
		refresh: vi.fn(async () => {}),
		clearLocalRepo: vi.fn(async () => {}),
		fetchContentDocument: vi.fn(async () => [
			{ slug: 'hello-world', title: 'Hello world' },
			{ slug: 'second-post', title: 'Second post' },
			{ slug: 'third-post', title: 'Third post' }
		]),
		goto: vi.fn(async () => {}),
		resolve: vi.fn((path: string) => path),
		invalidateAll: vi.fn(async () => {}),
		toasts: {
			success: vi.fn(),
			error: vi.fn()
		}
	};
});

vi.mock('$app/navigation', () => ({
	goto: sidebarEditorMocks.goto,
	invalidateAll: sidebarEditorMocks.invalidateAll
}));

vi.mock('$app/paths', () => ({
	resolve: sidebarEditorMocks.resolve
}));

vi.mock('$app/state', () => ({
	page: sidebarEditorMocks.page
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
		subscribe: sidebarEditorMocks.localRepoStore.subscribe,
		clear: sidebarEditorMocks.clearLocalRepo
	}
}));

vi.mock('$lib/stores/draft-branch', () => ({
	draftBranch: {
		subscribe(callback: (value: { branchName: string | null }) => void) {
			callback({ branchName: null });
			return () => {};
		}
	}
}));

vi.mock('$lib/stores/toasts', () => ({
	toasts: sidebarEditorMocks.toasts
}));

vi.mock('$lib/utils/routing', () => ({
	buildLoginRedirect: vi.fn((path: string) => path)
}));

import PagesLayout from '../../../routes/pages/+layout.svelte';

const layoutData = {
	isAuthenticated: false,
	user: null,
	selectedBackend: {
		kind: 'local' as const,
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
};

describe('routes/pages/+layout.svelte pages workspace navigation', () => {
	beforeEach(() => {
		sidebarEditorMocks.refresh.mockClear();
		sidebarEditorMocks.clearLocalRepo.mockClear();
		sidebarEditorMocks.fetchContentDocument.mockClear();
		sidebarEditorMocks.goto.mockClear();
		sidebarEditorMocks.resolve.mockClear();
		sidebarEditorMocks.invalidateAll.mockClear();
		sidebarEditorMocks.toasts.success.mockClear();
		sidebarEditorMocks.toasts.error.mockClear();
		sidebarEditorMocks.page.params = {};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages');
	});

	it('renders site pages only in the sidebar and edits top-level page order', async () => {
		const screen = render(PagesLayout, {
			data: layoutData
		});

		await expect.element(screen.getByRole('button', { name: 'Edit navigation' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'About Page' })).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Blog Posts' })).toBeVisible();
		await expect.element(screen.getByText('Hello world')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Edit navigation' }).click();

		await expect.element(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		await expect.element(screen.getByText('About Page')).toBeVisible();
		await expect.element(screen.getByText('Blog Posts')).toBeVisible();
		await expect.element(screen.getByText('Ungrouped')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expect.element(screen.getByRole('button', { name: 'Edit navigation' })).toBeVisible();
	});

	it('renders collection items in the collection index pane beside the editor', async () => {
		sidebarEditorMocks.page.params = {
			page: 'blog',
			itemId: 'hello-world'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog/hello-world/edit');

		const screen = render(PagesLayout, {
			data: layoutData
		});

		await expect.element(screen.getByRole('link', { name: 'New Blog Post' })).toBeVisible();
		await expect.element(screen.getByText('Hello world')).toBeVisible();
		await expect.element(screen.getByText('Second post')).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Blog Posts' })).toBeVisible();

		await screen.getByRole('button', { name: 'Edit order' }).click();
		await expect.element(screen.getByRole('button', { name: 'Save order' })).toBeVisible();
		await expect.element(screen.getByText('Ungrouped')).toBeVisible();
		expect(sidebarEditorMocks.fetchContentDocument).toHaveBeenCalled();
	});
});
