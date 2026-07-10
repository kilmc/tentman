import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveredConfig } from '$lib/config/discovery';
import type { LocalRepositoryBackend } from '$lib/repository/local';
import type {
	RepositoryBackend,
	RepositoryReadOptions,
	RepositoryWriteOptions
} from '$lib/repository/types';

const localRepoState = vi.hoisted(() => {
	type State = {
		status: 'ready';
		repo: {
			name: string;
			pathLabel: string;
		};
		backend: RepositoryBackend | null;
		error: null;
	};
	type Subscriber = (value: State) => void;
	let value: State = {
		status: 'ready',
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		},
		backend: null,
		error: null
	};
	const subscribers = new Set<Subscriber>();

	return {
		set(next: State) {
			value = next;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		},
		subscribe(subscriber: Subscriber) {
			subscriber(value);
			subscribers.add(subscriber);
			return () => subscribers.delete(subscriber);
		}
	};
});

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: {
		subscribe: localRepoState.subscribe,
		hydrate: vi.fn(),
		clear: vi.fn()
	}
}));

vi.mock('$lib/features/instructions/discovery', () => ({
	discoverInstructions: vi.fn(async () => ({
		instructions: [],
		issues: []
	}))
}));

import { localContent } from './local-content';

function createBackend(overrides: Partial<LocalRepositoryBackend> = {}): LocalRepositoryBackend {
	const configs: DiscoveredConfig[] = [
		{
			slug: 'pages',
			path: 'content/pages.tentman.json',
			config: {
				type: 'content',
				_tentmanId: 'pages',
				label: 'Pages',
				content: {
					mode: 'file',
					path: 'src/content/pages.json'
				},
				blocks: []
			}
		}
	];

	return {
		kind: 'local',
		cacheKey: 'local:docs',
		label: 'Docs',
		supportsDraftBranches: false,
		rootHandle: {} as FileSystemDirectoryHandle,
		repo: {
			name: 'Docs',
			pathLabel: '~/Docs'
		},
		invalidateDiscoveryCache: vi.fn(),
		getDiscoverySignature: vi.fn(async () => ({
			rootConfigText: null,
			navigationManifestText: null,
			contentConfigPaths: ['content/pages.tentman.json'],
			contentConfigFiles: [
				{
					path: 'content/pages.tentman.json',
					content: ''
				}
			],
			blockConfigPaths: [],
			blockConfigFiles: [],
			contentComponentFiles: []
		})),
		discoverConfigs: vi.fn(async () => configs),
		discoverBlockConfigs: vi.fn(async () => []),
		readRootConfig: vi.fn(async () => ({ debug: { cacheConfigs: false } })),
		readTextFile: vi.fn(async (path: string, _options?: RepositoryReadOptions) => {
			throw new Error(`Unexpected read: ${path}`);
		}),
		writeTextFile: vi.fn(
			async (_path: string, _content: string, _options?: RepositoryWriteOptions) => {}
		),
		writeBinaryFile: vi.fn(
			async (_path: string, _content: Uint8Array, _options?: RepositoryWriteOptions) => {}
		),
		deleteFile: vi.fn(async (_path: string, _options?: RepositoryWriteOptions) => {}),
		commitChanges: vi.fn(async () => {}),
		listDirectory: vi.fn(async () => []),
		fileExists: vi.fn(async () => false),
		readFile: vi.fn(async () => new File([], 'empty')),
		...overrides
	};
}

describe('stores/local-content', () => {
	beforeEach(() => {
		localContent.reset();
		vi.clearAllMocks();
	});

	it('keeps local configs available when the navigation manifest cannot be loaded', async () => {
		const backend = createBackend({
			readTextFile: vi.fn(async (path: string) => {
				if (path === 'tentman/navigation-manifest.json') {
					throw new Error('Cannot read navigation manifest');
				}

				throw new Error(`Unexpected read: ${path}`);
			})
		});
		localRepoState.set({
			status: 'ready',
			repo: {
				name: 'Docs',
				pathLabel: '~/Docs'
			},
			backend,
			error: null
		});

		await localContent.refresh({ force: true });

		expect(get(localContent)).toMatchObject({
			status: 'ready',
			configs: [
				{
					slug: 'pages'
				}
			],
			navigationManifest: {
				path: 'tentman/navigation-manifest.json',
				exists: false,
				manifest: null,
				error: 'Cannot read navigation manifest'
			},
			error: null
		});
	});
});
