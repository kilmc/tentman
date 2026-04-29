import { beforeEach, describe, expect, it, vi } from 'vitest';

function createStoreState<T>(initialValue: T) {
	let value = initialValue;
	const subscribers = new Set<(nextValue: T) => void>();

	return {
		set(nextValue: T) {
			value = nextValue;
			for (const subscriber of subscribers) {
				subscriber(value);
			}
		},
		subscribe(callback: (nextValue: T) => void) {
			callback(value);
			subscribers.add(callback);
			return () => subscribers.delete(callback);
		}
	};
}

const pluginRuntimeMocks = vi.hoisted(() => ({
	loadJavaScriptModuleFromText: vi.fn()
}));

const localRepoState = vi.hoisted(() =>
	createStoreState({
		backend: {
			readTextFile: vi.fn()
		}
	})
);

vi.mock('$lib/repository/local', async () => {
	const actual =
		await vi.importActual<typeof import('$lib/repository/local')>('$lib/repository/local');

	return {
		...actual,
		loadJavaScriptModuleFromText: pluginRuntimeMocks.loadJavaScriptModuleFromText
	};
});

vi.mock('$lib/stores/local-repo', () => ({
	localRepo: {
		subscribe: localRepoState.subscribe
	}
}));

import {
	clearPluginRegistryCache,
	loadMarkdownPluginsForMode,
	loadRegisteredPluginsForMode
} from './browser';

describe('plugins/browser', () => {
	beforeEach(() => {
		clearPluginRegistryCache();
		localRepoState.set({
			backend: {
				readTextFile: vi.fn()
			}
		});
		pluginRuntimeMocks.loadJavaScriptModuleFromText.mockReset();
		pluginRuntimeMocks.loadJavaScriptModuleFromText.mockResolvedValue({
			default: {
				id: 'buy-button',
				version: '0.1.0',
				capabilities: ['markdown', 'preview'],
				markdown: {
					htmlInlineNodes: [
						{
							id: 'buy-button',
							nodeName: 'buyButton',
							selector: 'a[data-tentman-plugin="buy-button"]',
							attributes: [],
							renderHTML() {
								return {
									tag: 'a',
									attributes: {
										'data-tentman-plugin': 'buy-button'
									},
									text: 'Buy online'
								};
							},
							editorView: {
								label() {
									return 'Buy button: Buy online';
								}
							},
							toolbarItems: [
								{
									id: 'buy-button',
									label: 'Buy Button',
									run() {}
								}
							]
						}
					]
				}
			}
		});
		vi.stubGlobal('fetch', vi.fn());
	});

	it('loads registered plugins from the local repository backend', async () => {
		const readTextFile = vi.fn().mockResolvedValue('export default {}');
		localRepoState.set({
			backend: {
				readTextFile
			}
		});

		const plugins = await loadRegisteredPluginsForMode(
			{
				pluginsDir: './tentman/plugins',
				plugins: ['buy-button']
			},
			'local'
		);

		expect(readTextFile).toHaveBeenCalledWith('tentman/plugins/buy-button/plugin.js');
		expect(plugins.map((plugin) => plugin.id)).toEqual(['buy-button']);
	});

	it('loads the same plugin shape in github-backed mode via the plugin module endpoint', async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response('export default {}', {
				status: 200,
				headers: {
					'content-type': 'text/javascript'
				}
			})
		);

		const plugins = await loadRegisteredPluginsForMode(
			{
				pluginsDir: './tentman/plugins',
				plugins: ['buy-button']
			},
			'github'
		);

		expect(fetch).toHaveBeenCalledWith(
			'/api/repo/plugin-module?path=tentman%2Fplugins%2Fbuy-button%2Fplugin.js'
		);
		expect(plugins[0]?.plugin.capabilities).toEqual(['markdown', 'preview']);
	});

	it('caches plugin registries per repo/config scope', async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response('export default {}', {
				status: 200,
				headers: {
					'content-type': 'text/javascript'
				}
			})
		);

		const rootConfig = {
			pluginsDir: './tentman/plugins',
			plugins: ['buy-button']
		};

		await loadRegisteredPluginsForMode(rootConfig, 'github', { scopeKey: 'github:acme/docs' });
		await loadRegisteredPluginsForMode(rootConfig, 'github', { scopeKey: 'github:acme/docs' });
		await loadRegisteredPluginsForMode(rootConfig, 'github', { scopeKey: 'github:other/docs' });

		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('clears cached plugin registries on demand', async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response('export default {}', {
				status: 200,
				headers: {
					'content-type': 'text/javascript'
				}
			})
		);

		const rootConfig = {
			pluginsDir: './tentman/plugins',
			plugins: ['buy-button']
		};

		await loadRegisteredPluginsForMode(rootConfig, 'github', { scopeKey: 'github:acme/docs' });
		await loadRegisteredPluginsForMode(rootConfig, 'github', { scopeKey: 'github:acme/docs' });
		clearPluginRegistryCache();
		await loadRegisteredPluginsForMode(rootConfig, 'github', { scopeKey: 'github:acme/docs' });

		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it('keeps markdown usable when a field references an unregistered plugin', async () => {
		const result = await loadMarkdownPluginsForMode(
			{
				id: 'body',
				type: 'markdown',
				plugins: ['buy-button']
			},
			{
				pluginsDir: './tentman/plugins',
				plugins: []
			},
			'github'
		);

		expect(result.toolbarItems).toEqual([]);
		expect(result.errors).toEqual([
			'Markdown field "body" enables plugin "buy-button", but it is not registered in root.plugins'
		]);
	});

	it('surfaces unsupported plugin capabilities as registry errors', async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response('export default {}', {
				status: 200,
				headers: {
					'content-type': 'text/javascript'
				}
			})
		);
		pluginRuntimeMocks.loadJavaScriptModuleFromText.mockResolvedValue({
			default: {
				id: 'buy-button',
				version: '0.1.0',
				capabilities: ['markdown', 'payments']
			}
		});

		const result = await loadMarkdownPluginsForMode(
			{
				id: 'body',
				type: 'markdown',
				plugins: ['buy-button']
			},
			{
				pluginsDir: './tentman/plugins',
				plugins: ['buy-button']
			},
			'github'
		);

		expect(result.plugins).toEqual([]);
		expect(result.errors[0]).toContain('capabilities includes unsupported value "payments"');
	});

	it('surfaces malformed markdown toolbar contributions as registry errors', async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response('export default {}', {
				status: 200,
				headers: {
					'content-type': 'text/javascript'
				}
			})
		);
		pluginRuntimeMocks.loadJavaScriptModuleFromText.mockResolvedValue({
			default: {
				id: 'buy-button',
				version: '0.1.0',
				capabilities: ['markdown'],
				markdown: {
					htmlInlineNodes: [
						{
							id: 'buy-button',
							nodeName: 'buyButton',
							selector: 'a[data-tentman-plugin="buy-button"]',
							attributes: [],
							renderHTML() {
								return {
									tag: 'a',
									attributes: {},
									text: 'Buy online'
								};
							},
							editorView: {
								label() {
									return 'Buy button: Buy online';
								}
							},
							toolbarItems: [
								{
									id: 'buy-button',
									label: 'Buy Button'
								}
							]
						}
					]
				}
			}
		});

		const result = await loadMarkdownPluginsForMode(
			{
				id: 'body',
				type: 'markdown',
				plugins: ['buy-button']
			},
			{
				pluginsDir: './tentman/plugins',
				plugins: ['buy-button']
			},
			'github'
		);

		expect(result.plugins).toEqual([]);
		expect(result.errors[0]).toContain(
			'markdown.htmlInlineNodes[0].toolbarItems[0] must define run or dialog'
		);
	});

	it('surfaces duplicate markdown node and toolbar ids as registry errors', async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response('export default {}', {
				status: 200,
				headers: {
					'content-type': 'text/javascript'
				}
			})
		);

		const createNode = (nodeName: string) => ({
			id: 'buy-button',
			nodeName,
			selector: 'a[data-tentman-plugin="buy-button"]',
			attributes: [],
			renderHTML() {
				return {
					tag: 'a',
					attributes: {},
					text: 'Buy online'
				};
			},
			editorView: {
				label() {
					return 'Buy button: Buy online';
				}
			},
			toolbarItems: [
				{
					id: 'buy-button',
					label: 'Buy Button',
					run() {}
				},
				{
					id: 'buy-button',
					label: 'Buy Button Again',
					run() {}
				}
			]
		});

		pluginRuntimeMocks.loadJavaScriptModuleFromText.mockResolvedValue({
			default: {
				id: 'buy-button',
				version: '0.1.0',
				capabilities: ['markdown'],
				markdown: {
					htmlInlineNodes: [createNode('buyButton'), createNode('buyButtonAlt')]
				}
			}
		});

		const result = await loadMarkdownPluginsForMode(
			{
				id: 'body',
				type: 'markdown',
				plugins: ['buy-button']
			},
			{
				pluginsDir: './tentman/plugins',
				plugins: ['buy-button']
			},
			'github'
		);

		expect(result.plugins).toEqual([]);
		expect(result.errors[0]).toContain(
			'markdown.htmlInlineNodes[0].toolbarItems[1].id duplicates "buy-button"'
		);
		expect(result.errors[0]).toContain('markdown.htmlInlineNodes[1].id duplicates "buy-button"');
	});

	it('surfaces malformed dialog select options as registry errors', async () => {
		vi.mocked(fetch).mockResolvedValue(
			new Response('export default {}', {
				status: 200,
				headers: {
					'content-type': 'text/javascript'
				}
			})
		);
		pluginRuntimeMocks.loadJavaScriptModuleFromText.mockResolvedValue({
			default: {
				id: 'buy-button',
				version: '0.1.0',
				capabilities: ['markdown'],
				markdown: {
					htmlInlineNodes: [
						{
							id: 'buy-button',
							nodeName: 'buyButton',
							selector: 'a[data-tentman-plugin="buy-button"]',
							attributes: [],
							renderHTML() {
								return {
									tag: 'a',
									attributes: {},
									text: 'Buy online'
								};
							},
							editorView: {
								label() {
									return 'Buy button: Buy online';
								}
							},
							toolbarItems: [
								{
									id: 'buy-button',
									label: 'Buy Button',
									dialog: {
										title: 'Buy button',
										fields: [
											{
												id: 'variant',
												label: 'Variant',
												type: 'select',
												options: [
													{
														label: 'Default',
														value: 'default'
													},
													{
														label: 'Default Again',
														value: 'default'
													}
												]
											}
										],
										submit() {}
									}
								}
							]
						}
					]
				}
			}
		});

		const result = await loadMarkdownPluginsForMode(
			{
				id: 'body',
				type: 'markdown',
				plugins: ['buy-button']
			},
			{
				pluginsDir: './tentman/plugins',
				plugins: ['buy-button']
			},
			'github'
		);

		expect(result.plugins).toEqual([]);
		expect(result.errors[0]).toContain(
			'markdown.htmlInlineNodes[0].toolbarItems[0].dialog.fields[0].options[1].value duplicates "default"'
		);
	});
});
