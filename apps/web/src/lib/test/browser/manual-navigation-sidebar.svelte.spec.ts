import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectElement, render } from '$lib/test-support/browser-test';
import {
	githubCacheWarmStatus,
	githubRepositoryCacheTestApi
} from '$lib/stores/github-repository-cache';
import {
	assertWorkflowRequestBudgetForTests,
	clearWorkflowInstrumentationEventsForTests,
	getWorkflowInstrumentationEventsForTests
} from '$lib/utils/workflow-instrumentation';

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

function createDeferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((promiseResolve, promiseReject) => {
		resolve = promiseResolve;
		reject = promiseReject;
	});

	return {
		promise,
		resolve,
		reject
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

	const localContentReadyState = {
		status: 'ready' as const,
		backendKey: 'local:docs',
		configs: [
			{
				slug: 'about',
				path: 'content/about.tentman.json',
				config: {
					type: 'content' as const,
					id: 'about',
					_tentmanId: 'about-page',
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
					_tentmanId: 'blog-posts',
					label: 'Blog Posts',
					collection: {
						ordering: true,
						groupManagement: false,
						groups: [
							{
								_tentmanId: 'featured',
								label: 'Featured',
								value: 'featured'
							}
						]
					},
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
		rootConfig: {
			content: {
				sorting: 'manual' as const
			}
		},
		navigationManifest: {
			path: 'tentman/navigation-manifest.json',
			exists: true,
			manifest: {
				version: 1 as const,
				content: {
					items: ['about-page', 'blog-posts']
				},
				collections: {
					'blog-posts': {
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
		instructionDiscovery: {
			instructions: [
				{
					path: 'tentman/instructions/create-page',
					definition: {
						id: 'create-page',
						label: 'Create page',
						description: 'Create a page.',
						inputs: []
					},
					templates: []
				}
			],
			issues: []
		},
		error: null
	};
	const localContentStore = createStoreState(localContentReadyState);

	return {
		backend,
		localContentReadyState,
		page: {
			params: {} as Record<string, string>,
			url: new URL('http://localhost/pages'),
			data: {} as Record<string, unknown>
		},
		localRepoStore,
		localContentStore,
		refresh: vi.fn(async () => {}),
		clearLocalRepo: vi.fn(async () => {}),
		fetchContentDocument: vi.fn(async () => [
			{ _tentmanId: 'hello-world', slug: 'hello-world', title: 'Hello world' },
			{
				_tentmanId: 'second-post',
				slug: 'second-post',
				title: 'Second post',
				tentmanGroup: 'featured'
			},
			{ _tentmanId: 'third-post', slug: 'third-post', title: 'Third post' }
		]),
		goto: vi.fn(async () => {}),
		resolve: vi.fn((path: string) => path),
		invalidate: vi.fn(async () => {}),
		toasts: {
			success: vi.fn(),
			error: vi.fn()
		}
	};
});

vi.mock('$app/navigation', () => ({
	goto: sidebarEditorMocks.goto,
	invalidate: sidebarEditorMocks.invalidate
}));

vi.mock('$app/paths', () => ({
	resolve: sidebarEditorMocks.resolve
}));

vi.mock('$app/state', () => ({
	page: sidebarEditorMocks.page,
	navigating: {
		current: null
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
		subscribe: sidebarEditorMocks.localRepoStore.subscribe,
		clear: sidebarEditorMocks.clearLocalRepo
	}
}));

vi.mock('$lib/stores/draft-branch', () => ({
	draftBranch: {
		subscribe(callback: (value: { branchName: string | null }) => void) {
			callback({ branchName: null });
			return () => {};
		},
		setBranch: vi.fn(),
		hasDraft: vi.fn(() => false),
		clear: vi.fn()
	}
}));

vi.mock('$lib/stores/toasts', () => ({
	toasts: sidebarEditorMocks.toasts
}));

vi.mock('$lib/utils/routing', () => ({
	buildLoginRedirect: vi.fn((path: string) => path),
	buildReposRedirect: vi.fn((path: string) => path),
	buildPathWithQuery: vi.fn((path: string) => path)
}));

import PagesLayout from '../../../routes/pages/+layout.svelte';
import PagesLayoutCollectionLandingHarness from '$lib/test/fixtures/PagesLayoutCollectionLandingHarness.svelte';
import PagesLayoutRepeatableWorkspaceHarness from '$lib/test/fixtures/PagesLayoutRepeatableWorkspaceHarness.svelte';
import PagesLayoutObjectPanelWorkspaceHarness from '$lib/test/fixtures/PagesLayoutObjectPanelWorkspaceHarness.svelte';

let desktopViewport = true;

function setViewportMode(mode: 'desktop' | 'mobile') {
	desktopViewport = mode === 'desktop';
}

const layoutData = {
	isAuthenticated: false,
	githubOAuthConfigured: true,
	user: null,
	recentRepos: [],
	selectedBackend: {
		kind: 'local' as const,
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		}
	},
	selectedRepo: null,
	activeDraftBranch: null,
	configs: [],
	blockConfigs: [],
	rootConfig: {
		content: {
			sorting: 'manual' as const
		}
	},
	navigationManifest: {
		path: 'tentman/navigation-manifest.json',
		exists: false,
		manifest: null,
		error: null
	},
	instructionDiscovery: {
		instructions: [
			{
				path: 'tentman/instructions/create-page',
				definition: {
					id: 'create-page',
					label: 'Create page',
					description: 'Create a page.',
					inputs: []
				},
				templates: []
			}
		],
		issues: []
	}
};

const githubLayoutData = {
	...layoutData,
	isAuthenticated: true,
	selectedBackend: {
		kind: 'github' as const,
		repo: {
			owner: 'acme',
			name: 'docs',
			full_name: 'acme/docs',
			default_branch: 'main'
		}
	},
	selectedRepo: {
		owner: 'acme',
		name: 'docs',
		full_name: 'acme/docs',
		default_branch: 'main'
	},
	activeDraftBranch: null,
	repositoryIdentity: {
		repoKey: 'github:acme/docs?ref=main',
		mode: 'github' as const,
		label: 'acme/docs',
		ref: 'main',
		headSha: 'head-main',
		treeSha: 'tree-main',
		resolvedAt: 1
	},
	configs: sidebarEditorMocks.localContentReadyState.configs,
	blockConfigs: [],
	rootConfig: sidebarEditorMocks.localContentReadyState.rootConfig,
	navigationManifest: sidebarEditorMocks.localContentReadyState.navigationManifest
};

const newsGithubLayoutData = {
	...githubLayoutData,
	configs: sidebarEditorMocks.localContentReadyState.configs.map((config) =>
		config.slug === 'blog'
			? {
					...config,
					slug: 'news',
					path: 'content/news.tentman.json',
					config: {
						...config.config,
						id: 'news',
						_tentmanId: 'news-items',
						label: 'News',
						itemLabel: 'News Item',
						content: {
							mode: 'directory' as const,
							path: 'src/content/news',
							template: 'templates/news.md'
						}
					}
				}
			: config
	),
	navigationManifest: {
		...sidebarEditorMocks.localContentReadyState.navigationManifest,
		manifest: {
			version: 1 as const,
			content: {
				items: ['about-page', 'news-items']
			},
			collections: {
				'news-items': {
					items: ['stable-1', 'stable-2'],
					groups: []
				}
			}
		}
	}
};

function createGitHubFallbackItems(count: number) {
	return Array.from({ length: count }, (_, index) => {
		const itemNumber = index + 1;
		return {
			itemId: `post-${itemNumber}`,
			route: `post-${itemNumber}`,
			path: `src/content/posts/post-${itemNumber}.md`,
			filename: `post-${itemNumber}.md`,
			blobSha: `blob-${itemNumber}`,
			title: `post ${itemNumber}`,
			sortDate: null,
			hydration: 'fallback' as const,
			hrefItemId: `post-${itemNumber}`
		};
	});
}

function createGitHubProjectionItems(blobShas: string[]) {
	return blobShas.map((blobSha) => {
		const itemNumber = blobSha.replace('blob-', '');
		return {
			itemId: `stable-${itemNumber}`,
			route: `post-${itemNumber}`,
			path: `src/content/posts/post-${itemNumber}.md`,
			filename: `post-${itemNumber}.md`,
			blobSha,
			title: `Post ${itemNumber}`,
			sortDate: null,
			hydration: 'hydrated' as const,
			hrefItemId: `post-${itemNumber}`
		};
	});
}

function createGitHubIndexPayload(items = createGitHubFallbackItems(2)) {
	return {
		identity: {
			repoKey: 'github:acme/docs?ref=main',
			ref: 'main',
			headSha: 'head-main',
			treeSha: 'tree-main',
			configSlug: 'blog',
			configPath: 'content/blog.tentman.json',
			contentIdentity: 'src/content/posts:templates/post.md',
			schemaIdentity: 'title'
		},
		configSlug: 'blog',
		mode: 'directory' as const,
		items
	};
}

function createGitHubNewsIndexPayload(items = createGitHubFallbackItems(2)) {
	const payload = createGitHubIndexPayload(items);

	return {
		...payload,
		configSlug: 'news',
		identity: {
			...payload.identity,
			configSlug: 'news',
			configPath: 'content/news.tentman.json',
			contentIdentity: 'src/content/news:templates/news.md'
		}
	};
}

function getCollectionGroupSectionText(label: string): string {
	const headings = Array.from(document.querySelectorAll('h3'));
	const heading = headings.find((entry) => entry.textContent?.trim() === label);

	return heading?.closest('section')?.textContent ?? '';
}

describe('routes/pages/+layout.svelte pages workspace navigation', () => {
	beforeEach(async () => {
		await githubRepositoryCacheTestApi.reset();
		vi.unstubAllGlobals();
		setViewportMode('desktop');
		window.matchMedia = vi.fn((query: string) => ({
			matches: query === '(min-width: 1024px)' ? desktopViewport : false,
			media: query,
			onchange: null,
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			addListener: vi.fn(),
			removeListener: vi.fn(),
			dispatchEvent: vi.fn()
		})) as typeof window.matchMedia;

		sidebarEditorMocks.refresh.mockClear();
		sidebarEditorMocks.clearLocalRepo.mockClear();
		sidebarEditorMocks.fetchContentDocument.mockClear();
		sidebarEditorMocks.goto.mockClear();
		sidebarEditorMocks.resolve.mockClear();
		sidebarEditorMocks.invalidate.mockClear();
		sidebarEditorMocks.toasts.success.mockClear();
		sidebarEditorMocks.toasts.error.mockClear();
		sidebarEditorMocks.localContentStore.set(sidebarEditorMocks.localContentReadyState);
		sidebarEditorMocks.page.params = {};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages');
		sidebarEditorMocks.page.data = {};
		clearWorkflowInstrumentationEventsForTests();
	});

	it('renders site pages only in the sidebar and edits top-level page order', async () => {
		const screen = await render(PagesLayout, {
			data: layoutData
		});

		await expectElement(screen.getByRole('link', { name: 'Add page' })).toBeVisible();
		await expectElement(screen.getByRole('link', { name: 'About Page' })).toBeVisible();
		await expectElement(screen.getByRole('link', { name: 'Blog Posts' })).toBeVisible();
		await expectElement(screen.getByText('Hello world')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Site settings' }).click();
		await screen.getByText('Edit navigation').click();

		await expectElement(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
		await expectElement(screen.getByText('About Page')).toBeVisible();
		await expectElement(screen.getByText('Blog Posts')).toBeVisible();
		await expectElement(screen.getByText('Ungrouped')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Cancel' }).click();

		await expectElement(screen.getByRole('link', { name: 'Add page' })).toBeVisible();
	});

	it('shows local rescan feedback from discovered config and block counts', async () => {
		const screen = await render(PagesLayout, {
			data: layoutData
		});

		await screen.getByRole('button', { name: 'Site settings' }).click();
		await screen.getByText('Rescan repo').click();

		expect(sidebarEditorMocks.refresh).toHaveBeenCalledWith({ force: true });
		expect(sidebarEditorMocks.toasts.success).toHaveBeenCalledWith(
			'Found 2 content configs and 0 blocks.'
		);
	});

	it('hides the sidebar Add page link when no instructions are available', async () => {
		sidebarEditorMocks.localContentStore.set({
			...sidebarEditorMocks.localContentReadyState,
			instructionDiscovery: {
				instructions: [],
				issues: []
			}
		});

		const screen = await render(PagesLayout, {
			data: {
				...layoutData,
				instructionDiscovery: {
					instructions: [],
					issues: []
				}
			}
		});

		await expectElement(screen.getByRole('link', { name: 'Add page' })).not.toBeInTheDocument();
	});

	it('renders collection items in the collection panel beside the editor', async () => {
		sidebarEditorMocks.page.params = {
			page: 'blog',
			itemId: 'hello-world'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog/hello-world/edit');

		const screen = await render(PagesLayout, {
			data: layoutData
		});

		await expectElement(screen.getByRole('link', { name: 'New Blog Post' })).toBeVisible();
		await expectElement(
			screen.getByRole('link', { name: 'Manage groups' })
		).not.toBeInTheDocument();
		await expectElement(screen.getByText('Hello world')).toBeVisible();
		await expectElement(screen.getByText('Second post')).toBeVisible();
		await expectElement(screen.getByRole('link', { name: 'Blog Posts' })).toBeVisible();

		await screen.getByRole('button', { name: 'Customize order' }).click();
		await expectElement(screen.getByRole('button', { name: 'Save order' })).toBeVisible();
		await expectElement(screen.getByText('Ungrouped')).toBeVisible();
		expect(sidebarEditorMocks.fetchContentDocument).toHaveBeenCalled();
	});

	it('regroups collection panel items from the live navigation manifest', async () => {
		sidebarEditorMocks.page.params = {
			page: 'blog',
			itemId: 'hello-world'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog/hello-world/edit');

		await render(PagesLayout, {
			data: layoutData
		});

		await expect.poll(() => document.body.textContent ?? '').toContain('Hello world');
		expect(getCollectionGroupSectionText('Featured')).toContain('Second post');
		expect(getCollectionGroupSectionText('Featured')).not.toContain('Hello world');

		sidebarEditorMocks.localContentStore.set({
			...sidebarEditorMocks.localContentReadyState,
			navigationManifest: {
				...sidebarEditorMocks.localContentReadyState.navigationManifest,
				manifest: {
					...sidebarEditorMocks.localContentReadyState.navigationManifest.manifest,
					collections: {
						'blog-posts': {
							items: ['second-post', 'hello-world', 'third-post'],
							groups: [
								{
									id: 'featured',
									label: 'Featured',
									items: ['hello-world']
								}
							]
						}
					}
				}
			}
		});

		await expect.poll(() => getCollectionGroupSectionText('Featured')).toContain('Hello world');
		expect(getCollectionGroupSectionText('Featured')).not.toContain('Second post');
	});

	it('shows the Manage Groups button only when group management is enabled', async () => {
		sidebarEditorMocks.page.params = {
			page: 'blog',
			itemId: 'hello-world'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog/hello-world/edit');
		sidebarEditorMocks.localContentStore.set({
			...sidebarEditorMocks.localContentReadyState,
			configs: sidebarEditorMocks.localContentReadyState.configs.map((config) =>
				config.slug === 'blog'
					? {
							...config,
							config: {
								...config.config,
								collection: {
									ordering: true,
									groups:
										typeof config.config.collection === 'object' &&
										config.config.collection !== null
											? config.config.collection.groups
											: [],
									groupManagement: true
								}
							}
						}
					: config
			) as typeof sidebarEditorMocks.localContentReadyState.configs
		});

		const screen = await render(PagesLayout, {
			data: layoutData
		});

		const manageGroupsLink = screen.getByRole('link', { name: 'Manage groups' });
		await expectElement(manageGroupsLink).toBeVisible();
		expect(manageGroupsLink).toHaveAttribute('href', '/pages/blog/groups');
	});

	it('opens and closes the mobile sidebar from the header', async () => {
		setViewportMode('mobile');

		const screen = await render(PagesLayout, {
			data: layoutData
		});

		await screen.getByRole('button', { name: 'Open site navigation' }).click();
		await expectElement(screen.getByTestId('pages-mobile-sidebar')).toBeVisible();

		await screen.getByRole('button', { name: 'Close site navigation' }).click();
		await expectElement(screen.getByTestId('pages-mobile-sidebar')).not.toBeInTheDocument();
	});

	it('opens the collection panel as a mobile overlay from the header', async () => {
		setViewportMode('mobile');

		sidebarEditorMocks.page.params = {
			page: 'blog',
			itemId: 'hello-world'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog/hello-world/edit');

		const screen = await render(PagesLayout, {
			data: layoutData
		});

		await screen.getByRole('button', { name: 'Show items panel' }).click();
		await expectElement(screen.getByTestId('pages-mobile-collection-panel')).toBeVisible();
		await expectElement(screen.getByRole('button', { name: 'Done' })).toBeVisible();
	});

	it('reopens the collection panel when selecting a collection from the sidebar', async () => {
		sidebarEditorMocks.page.params = {
			page: 'blog'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog');

		const screen = await render(PagesLayoutCollectionLandingHarness, {
			data: layoutData
		});

		await expect
			.poll(() => sidebarEditorMocks.fetchContentDocument.mock.calls.length)
			.toBeGreaterThan(0);
		await expectElement(screen.getByText('Hello world')).toBeVisible();
		await screen.getByRole('button', { name: 'Hide collection panel' }).click();

		await expectElement(screen.getByText('Hello world')).not.toBeInTheDocument();
		await expectElement(screen.getByRole('link', { name: 'Open first item' })).toBeVisible();

		const blogLink = document.querySelector<HTMLAnchorElement>('a[href="/pages/blog"]');
		expect(blogLink).not.toBeNull();
		blogLink?.addEventListener('click', (event) => event.preventDefault(), {
			capture: true,
			once: true
		});
		await screen.getByRole('link', { name: 'Blog Posts' }).click();

		await expectElement(screen.getByText('Hello world')).toBeVisible();
		await expectElement(
			screen.getByRole('button', { name: 'Hide collection panel' })
		).toBeVisible();
	});

	it('renders the side panel as a sibling of the main panel', async () => {
		sidebarEditorMocks.page.params = {
			page: 'blog',
			itemId: 'hello-world'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog/hello-world/edit');

		const screen = await render(PagesLayoutRepeatableWorkspaceHarness, {
			data: layoutData
		});

		await screen.getByRole('button', { name: 'Edit Section 1: Opening' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Section 1: Opening' })).toBeVisible();
		await expectElement(screen.getByTestId('pages-side-panel')).toBeInTheDocument();

		const workspaceGrid = document.querySelector('[data-testid="pages-workspace-grid"]');
		const mainPanel = document.querySelector('[data-testid="pages-main-panel"]');
		const sidePanel = document.querySelector('[data-testid="pages-side-panel"]');

		expect(workspaceGrid).not.toBeNull();
		expect(mainPanel).not.toBeNull();
		expect(sidePanel).not.toBeNull();
		expect(Array.from(workspaceGrid?.children ?? [])).toContain(mainPanel);
		expect(Array.from(workspaceGrid?.children ?? [])).toContain(sidePanel);
		expect(mainPanel?.contains(sidePanel)).toBe(false);
	});

	it('renders object fields with nested collections as side-panel cards in the pages workspace', async () => {
		sidebarEditorMocks.page.params = {
			page: 'projects',
			itemId: 'panorama-4'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/projects/panorama-4/edit');

		const screen = await render(PagesLayoutObjectPanelWorkspaceHarness, {
			data: layoutData
		});

		await expectElement(screen.getByRole('button', { name: 'Edit Gallery' })).toBeVisible();
		await expectElement(screen.getByLabelText('Layout')).not.toBeInTheDocument();

		await screen.getByRole('button', { name: 'Edit Gallery' }).click();

		await expectElement(screen.getByRole('heading', { name: 'Gallery' })).toBeVisible();
		await expectElement(screen.getByLabelText('Layout')).toHaveValue('grid');
		await expectElement(
			screen.getByRole('button', { name: 'Edit Image 1: Opening view' })
		).toBeVisible();
	});

	it('renders GitHub fallback rows before projection hydration completes', async () => {
		sidebarEditorMocks.page.params = {
			page: 'blog'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog');
		const projectionPayload = createDeferred<{
			indexIdentity: ReturnType<typeof createGitHubIndexPayload>['identity'];
			items: ReturnType<typeof createGitHubProjectionItems>;
		}>();
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createGitHubIndexPayload());
			}
			if (url.startsWith('/api/repo/collection-projections')) {
				return Response.json(await projectionPayload.promise);
			}
			if (url.startsWith('/api/repo/config-states')) {
				return Response.json({ statesBySlug: {} });
			}
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: {
						title: 'About'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/item-view')) {
				return Response.json({
					item: {
						title: 'Cached item'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal('fetch', fetch);

		await render(PagesLayoutCollectionLandingHarness, {
			data: githubLayoutData
		});

		await expect.poll(() => document.body.textContent).toContain('post 1');
		expect(document.body.textContent).not.toContain('Post 1');

		projectionPayload.resolve({
			indexIdentity: createGitHubIndexPayload().identity,
			items: createGitHubProjectionItems(['blob-1', 'blob-2'])
		});

		await expect.poll(() => document.body.textContent).toContain('Post 1');
	});

	it('keeps the desktop GitHub news collection landing usable without repeated bootstrap or document warming', async () => {
		sidebarEditorMocks.page.params = {
			page: 'news'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/news');
		const fallbackItems = createGitHubFallbackItems(32);
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createGitHubNewsIndexPayload(fallbackItems));
			}
			if (url.startsWith('/api/repo/collection-projections')) {
				const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
				return Response.json({
					indexIdentity: createGitHubNewsIndexPayload().identity,
					items: createGitHubProjectionItems(body.blobShas)
				});
			}
			if (url.startsWith('/api/repo/config-states')) {
				return Response.json({ statesBySlug: {} });
			}
			if (url.startsWith('/api/repo/item-view')) {
				throw new Error('desktop news landing should not warm full item documents');
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal('fetch', fetch);

		const screen = await render(PagesLayoutCollectionLandingHarness, {
			data: newsGithubLayoutData
		});

		await expectElement(screen.getByRole('link', { name: 'New News Item' })).toBeVisible();
		await expect.poll(() => document.body.textContent).toContain('Post 1');
		await expect.poll(() => document.body.textContent).toContain('Post 30');
		expect(document.body.textContent).toContain('post 31');
		expect(document.body.textContent).not.toContain('Post 31');

		const calls = fetch.mock.calls.map(([input]) => String(input));
		expect(calls.filter((url) => url.startsWith('/api/repo/config-states'))).toHaveLength(1);
		expect(calls.filter((url) => url.startsWith('/api/repo/collection-index'))).toHaveLength(1);
		expect(calls.some((url) => url.startsWith('/api/repo/item-view'))).toBe(false);
		const projectionCalls = calls.filter((url) => url.startsWith('/api/repo/collection-projections'));
		expect(projectionCalls.length).toBeGreaterThan(0);
		expect(projectionCalls.length).toBeLessThanOrEqual(2);

		const events = getWorkflowInstrumentationEventsForTests();
		expect(events).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					kind: 'browser-request',
					workflow: 'desktop-collection-landing',
					route: '/pages/news',
					endpoint: '/api/repo/collection-index?slug=news',
					priority: 'foreground',
					cacheTaskKey: 'collectionIndex:news',
					resultStatus: 'ok'
				}),
				expect.objectContaining({
					kind: 'browser-request',
					workflow: 'desktop-collection-landing',
					route: '/pages/news',
					endpoint: '/api/repo/collection-projections',
					method: 'POST',
					priority: 'foreground',
					resultStatus: 'ok'
				}),
				expect.objectContaining({
					kind: 'browser-request',
					workflow: 'desktop-collection-landing',
					route: '/pages/news',
					endpoint: '/api/repo/config-states',
					priority: 'foreground',
					resultStatus: 'ok'
				}),
				expect.objectContaining({
					kind: 'workflow-readiness',
					workflow: 'desktop-collection-landing',
					mark: 'ready',
					route: '/pages/news',
					slug: 'news'
				})
			])
		);
		assertWorkflowRequestBudgetForTests({
			workflow: 'desktop-collection-landing',
			route: '/pages/news',
			maxBrowserRequests: 4,
			maxGitHubRequests: 0,
			maxRouteDataFallbacks: 0,
			maxRequests: 4
		});
	});

	for (const itemCount of [25, 222]) {
		it(`renders ${itemCount} GitHub collection route-data items before a client collection refresh completes`, async () => {
			sidebarEditorMocks.page.params = {
				page: 'news'
			};
			sidebarEditorMocks.page.url = new URL('http://localhost/pages/news');
			sidebarEditorMocks.page.data = {
				collectionNavigation: {
					items: createGitHubProjectionItems(
						Array.from({ length: itemCount }, (_, index) => `blob-${index + 1}`)
					),
					groups: []
				}
			};
			const collectionRefresh = createDeferred<Response>();
			const fetch = vi.fn(async (input: RequestInfo | URL) => {
				const url = String(input);
				if (url.startsWith('/api/repo/collection-index')) {
					return collectionRefresh.promise;
				}
				if (url.startsWith('/api/repo/config-states')) {
					return Response.json({ statesBySlug: {} });
				}
				throw new Error(`Unexpected fetch: ${url}`);
			});
			vi.stubGlobal('fetch', fetch);

			const screen = await render(PagesLayoutCollectionLandingHarness, {
				data: newsGithubLayoutData
			});

			await expectElement(screen.getByRole('link', { name: /^Post 1$/ })).toBeVisible();
			await expectElement(
				screen.getByRole('link', { name: new RegExp(`^Post ${itemCount}$`) })
			).toBeVisible();
			await expectElement(screen.getByText('No items yet.')).not.toBeInTheDocument();
			collectionRefresh.resolve(Response.json(createGitHubNewsIndexPayload([])));
		});
	}

	it('surfaces GitHub collection route-data errors instead of the empty collection state', async () => {
		sidebarEditorMocks.page.params = {
			page: 'news'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/news');
		sidebarEditorMocks.page.data = {
			pageSlug: 'news',
			collectionNavigation: {
				items: [],
				groups: []
			},
			contentError: 'collection projection batch request failed (503)'
		};
		const collectionRefresh = createDeferred<Response>();
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return collectionRefresh.promise;
			}
			if (url.startsWith('/api/repo/config-states')) {
				return Response.json({ statesBySlug: {} });
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal('fetch', fetch);

		const screen = await render(PagesLayoutCollectionLandingHarness, {
			data: newsGithubLayoutData
		});

		await expectElement(
			screen.getByText('collection projection batch request failed (503)')
		).toBeVisible();
		await expectElement(screen.getByText('No items yet.')).not.toBeInTheDocument();
		collectionRefresh.resolve(Response.json(createGitHubNewsIndexPayload([])));
	});

	it('shows GitHub cache progress in the sidebar with a cache details link', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createGitHubIndexPayload());
			}
			if (url.startsWith('/api/repo/config-states')) {
				return Response.json({ statesBySlug: {} });
			}
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: { title: 'About' },
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/item-view')) {
				return Response.json({
					item: { title: 'Cached item' },
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			return Response.json({
				indexIdentity: createGitHubIndexPayload().identity,
				items: createGitHubProjectionItems(['blob-1', 'blob-2'])
			});
		});
		vi.stubGlobal('fetch', fetch);

		githubCacheWarmStatus.set({
			phase: 'warming',
			message: 'Caching site data',
			currentCollectionSlug: 'blog',
			totalCollections: 1,
			warmedCollections: 1,
			totalItems: 2,
			hydratedItems: 1,
			totalTasks: 8,
			completedTasks: 3,
			showProgress: true,
			error: null
		});
		const screen = await render(PagesLayout, {
			data: githubLayoutData
		});

		const cacheLink = screen.getByRole('link', {
			name: 'Caching site. Open cache details'
		});
		await expectElement(cacheLink).toBeVisible();
		expect(cacheLink).toHaveAttribute('href', '/pages/cache');
		await expectElement(screen.getByText('3/8')).toBeVisible();
	});

	it('hides the GitHub cache sidebar affordance once the site cache is ready', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createGitHubIndexPayload());
			}
			if (url.startsWith('/api/repo/config-states')) {
				return Response.json({ statesBySlug: {} });
			}
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: { title: 'About' },
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/item-view')) {
				return Response.json({
					item: { title: 'Cached item' },
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			return Response.json({
				indexIdentity: createGitHubIndexPayload().identity,
				items: createGitHubProjectionItems(['blob-1', 'blob-2'])
			});
		});
		vi.stubGlobal('fetch', fetch);

		const screen = await render(PagesLayout, {
			data: githubLayoutData
		});
		githubCacheWarmStatus.set({
			phase: 'ready',
			message: 'Site cache ready',
			currentCollectionSlug: null,
			totalCollections: 1,
			warmedCollections: 1,
			totalItems: 2,
			hydratedItems: 2,
			totalTasks: 8,
			completedTasks: 8,
			showProgress: false,
			error: null
		});

		expect(document.body.textContent).not.toContain('Site cache ready');
	});

	it('renders GitHub config states from the normalized workflow payload', async () => {
		const fetch = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.startsWith('/api/repo/config-states')) {
				return Response.json({
					statesBySlug: {},
					workflowData: {
						identity: null,
						statesBySlug: {
							about: {
								value: false,
								label: 'Draft',
								variant: 'warning',
								icon: 'file-pen',
								visibility: {
									navigation: true,
									header: true,
									card: true
								}
							}
						},
						stateConfigCount: 1,
						readiness: 'ready',
						cacheMiss: null
					}
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal('fetch', fetch);

		const screen = await render(PagesLayout, {
			data: githubLayoutData
		});

		await expectElement(screen.getByRole('link', { name: 'About Page' })).toBeVisible();
		await expect.poll(() => document.body.textContent ?? '').toContain('Draft');
	});

	it('hydrates visible GitHub collection titles before background rows in the panel', async () => {
		sidebarEditorMocks.page.params = {
			page: 'blog'
		};
		sidebarEditorMocks.page.url = new URL('http://localhost/pages/blog');
		const fallbackItems = createGitHubFallbackItems(32);
		const backgroundProjectionPayload = createDeferred<{
			indexIdentity: ReturnType<typeof createGitHubIndexPayload>['identity'];
			items: ReturnType<typeof createGitHubProjectionItems>;
		}>();
		const projectionCalls: string[][] = [];
		const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.startsWith('/api/repo/collection-index')) {
				return Response.json(createGitHubIndexPayload(fallbackItems));
			}
			if (url.startsWith('/api/repo/collection-projections')) {
				const body = JSON.parse(String(init?.body)) as { blobShas: string[] };
				projectionCalls.push(body.blobShas);
				if (projectionCalls.length === 1) {
					return Response.json({
						indexIdentity: createGitHubIndexPayload().identity,
						items: createGitHubProjectionItems(body.blobShas)
					});
				}
				return Response.json(await backgroundProjectionPayload.promise);
			}
			if (url.startsWith('/api/repo/config-states')) {
				return Response.json({ statesBySlug: {} });
			}
			if (url.startsWith('/api/repo/form-config')) {
				return Response.json({
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/page-view')) {
				return Response.json({
					content: {
						title: 'About'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			if (url.startsWith('/api/repo/item-view')) {
				return Response.json({
					item: {
						title: 'Cached item'
					},
					blockConfigs: [],
					packageBlocks: [],
					blockRegistryError: null
				});
			}
			throw new Error(`Unexpected fetch: ${url}`);
		});
		vi.stubGlobal('fetch', fetch);

		await render(PagesLayoutCollectionLandingHarness, {
			data: githubLayoutData
		});

		await expect.poll(() => document.body.textContent).toContain('Post 1');
		await expect.poll(() => document.body.textContent).toContain('Post 30');
		await expect.poll(() => document.body.textContent).toContain('post 31');
		expect(document.body.textContent).not.toContain('Post 31');
		expect(projectionCalls[0]).toHaveLength(30);

		backgroundProjectionPayload.resolve({
			indexIdentity: createGitHubIndexPayload().identity,
			items: createGitHubProjectionItems(['blob-31', 'blob-32'])
		});

		await expect.poll(() => document.body.textContent).toContain('Post 31');
	});
});
