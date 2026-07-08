<script lang="ts">
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import PageStickyFooter from '$lib/components/PageStickyFooter.svelte';
	import { onMount, setContext } from 'svelte';
	import MarkdownField from '$lib/components/form/MarkdownField.svelte';
	import {
		FORM_CONTENT_CONTEXT,
		type FormContentContext
	} from '$lib/components/form/form-content-context';
	import MarkdownFieldPlaywrightHarness from '$lib/test/fixtures/MarkdownFieldPlaywrightHarness.svelte';
	import type { ContentComponentRegistry } from '$lib/content-components/registry';
	import type { BlockUsage } from '$lib/config/types';
	import type { DraftAssetStore } from '$lib/features/draft-assets/types';

	function createEmptyRegistry(): ContentComponentRegistry {
		return {
			components: [],
			errors: [],
			getByName() {
				return undefined;
			}
		};
	}

	function createBuyButtonRegistry(): ContentComponentRegistry {
		const component = {
			directory: 'src/lib/content-components/buy-button',
			componentJsonPath: 'src/lib/content-components/buy-button/component.json',
			renderTemplatePath: 'src/lib/content-components/buy-button/render.njk',
			renderTemplateSource:
				'<a class="buy-button buy-button--{{ variant }}" href="{{ href | escape }}">{{ label | escape }}</a>',
			definition: {
				id: 'buy-button',
				name: 'buy-button',
				kind: 'inline' as const,
				attributes: {
					href: {
						type: 'string' as const,
						required: true
					},
					label: {
						type: 'string' as const,
						required: true,
						default: 'Buy online',
						valueFromMarkdownLabel: true
					},
					variant: {
						type: 'enum' as const,
						default: 'default',
						options: ['default', 'secondary']
					}
				}
			}
		};

		return {
			components: [component],
			errors: [],
			getByName(name: string) {
				return name === component.definition.name ? component : undefined;
			}
		};
	}

	function createProjectGalleryRegistry(): ContentComponentRegistry {
		const component = {
			directory: 'src/lib/content-components/project-gallery',
			componentJsonPath: 'src/lib/content-components/project-gallery/component.json',
			renderTemplatePath: 'src/lib/content-components/project-gallery/render.njk',
			renderTemplateSource: '<div>Gallery</div>',
			definition: {
				id: 'project-gallery',
				name: 'project-gallery',
				kind: 'block' as const,
				attributes: {
					galleryId: {
						type: 'string' as const,
						required: true,
						reference: true,
						referenceScope: 'container' as const,
						editor: {
							label: 'Gallery'
						}
					}
				}
			}
		};

		return {
			components: [component],
			errors: [],
			getByName(name: string) {
				return name === component.definition.name ? component : undefined;
			}
		};
	}

	function createGalleryEmbedRegistry(): ContentComponentRegistry {
		const component = {
			directory: 'src/lib/content-components/gallery-embed',
			componentJsonPath: 'src/lib/content-components/gallery-embed/component.json',
			renderTemplatePath: 'src/lib/content-components/gallery-embed/render.njk',
			renderTemplateSource: '<div>{{ data.gallery.title }}</div>',
			definition: {
				id: 'gallery-embed',
				name: 'gallery-embed',
				kind: 'block' as const,
				attributes: {
					galleryRef: {
						type: 'string' as const,
						default: 'main',
						reference: true,
						referenceScope: 'container' as const,
						editor: {
							hidden: true
						}
					}
				}
			}
		};

		return {
			components: [component],
			errors: [],
			getByName(name: string) {
				return name === component.definition.name ? component : undefined;
			}
		};
	}

	function createHeroEmbedRegistry(): ContentComponentRegistry {
		const component = {
			directory: 'src/lib/content-components/hero-embed',
			componentJsonPath: 'src/lib/content-components/hero-embed/component.json',
			renderTemplatePath: 'src/lib/content-components/hero-embed/render.njk',
			renderTemplateSource: '<div>{{ data.title }}</div>',
			definition: {
				id: 'hero-embed',
				name: 'hero-embed',
				kind: 'block' as const,
				attributes: {
					heroRef: {
						type: 'string' as const,
						required: true,
						reference: true,
						referenceScope: 'container' as const,
						editor: {
							label: 'Hero'
						}
					}
				}
			}
		};

		return {
			components: [component],
			errors: [],
			getByName(name: string) {
				return name === component.definition.name ? component : undefined;
			}
		};
	}

	function createSocialCardEmbedRegistry(): ContentComponentRegistry {
		const component = {
			directory: 'src/lib/content-components/social-card-embed',
			componentJsonPath: 'src/lib/content-components/social-card-embed/component.json',
			renderTemplatePath: 'src/lib/content-components/social-card-embed/render.njk',
			renderTemplateSource: '<div>{{ data.title }}</div>',
			definition: {
				id: 'social-card-embed',
				name: 'social-card-embed',
				kind: 'block' as const,
				attributes: {
					cardRef: {
						type: 'string' as const,
						required: true,
						reference: true,
						referenceScope: 'container' as const,
						editor: {
							label: 'Card'
						}
					}
				}
			}
		};

		return {
			components: [component],
			errors: [],
			getByName(name: string) {
				return name === component.definition.name ? component : undefined;
			}
		};
	}

	function createStaticMarkerRegistry(): ContentComponentRegistry {
		const component = {
			directory: 'src/lib/content-components/static-marker',
			componentJsonPath: 'src/lib/content-components/static-marker/component.json',
			renderTemplatePath: 'src/lib/content-components/static-marker/render.njk',
			renderTemplateSource: '<div>Static marker</div>',
			definition: {
				id: 'static-marker',
				name: 'static-marker',
				kind: 'block' as const,
				attributes: {}
			}
		};

		return {
			components: [component],
			errors: [],
			getByName(name: string) {
				return name === component.definition.name ? component : undefined;
			}
		};
	}

	const scenario = $derived(page.url.searchParams.get('scenario') ?? 'basic');
	const longMarkdown = Array.from(
		{ length: 80 },
		(_, index) =>
			`## Section ${index + 1}\n\nThis is enough markdown content to make the editor scroll.`
	).join('\n\n');
	const initialBasicValue = $derived.by(() => {
		if (scenario === 'upload') {
			return '';
		}

		if (scenario === 'link') {
			return '[Example](https://example.com/old)';
		}

		if (scenario === 'long') {
			return longMarkdown;
		}

		return '# Hello world';
	});
	const initialComponentValue = $derived(
		scenario === 'component-edit'
			? ':buy-button[Buy now]{href="https://example.com/shop" variant="default"}'
			: ''
	);

	let basicValue = $state('');
	let componentValue = $state('');
	let brokenComponentValue = $state(':buy-button[Old label]{href="https://example.com/old"');
	let brokenComponentErrors = $state<string[]>([]);
	let disabledComponentValue = $state(
		':buy-button[Disabled label]{href="https://example.com/disabled" variant="secondary"}'
	);
	let disabledComponentErrors = $state<string[]>([]);
	let referenceInsertValue = $state('');
	let referenceInsertErrors = $state<string[]>([]);
	let referenceEditValue = $state('::project-gallery{galleryId="city-sketches"}');
	let referenceEditErrors = $state<string[]>([]);
	let unresolvedReferenceValue = $state('::project-gallery{galleryId="missing-gallery"}');
	let unresolvedReferenceErrors = $state<string[]>([]);
	let siblingObjectReferenceValue = $state('::gallery-embed');
	let siblingObjectReferenceErrors = $state<string[]>([]);
	let topLevelReferenceValue = $state('');
	let topLevelReferenceErrors = $state<string[]>([]);
	let nestedObjectReferenceValue = $state('');
	let nestedObjectReferenceErrors = $state<string[]>([]);
	let staticMarkerValue = $state('::static-marker');
	let staticMarkerErrors = $state<string[]>([]);
	let deleteCalls = $state<string[]>([]);
	let createCalls = $state<Array<{ name: string; repoKey: string; storagePath?: string }>>([]);
	let basicSemanticDirty = $state(false);

	const urlByRef = new Map([
		['draft-asset:hero', 'blob:hero'],
		['draft-asset:uploaded', 'blob:uploaded']
	]);
	const emptyRegistry = createEmptyRegistry();
	const buyButtonRegistry = createBuyButtonRegistry();
	const projectGalleryRegistry = createProjectGalleryRegistry();
	const galleryEmbedRegistry = createGalleryEmbedRegistry();
	const heroEmbedRegistry = createHeroEmbedRegistry();
	const socialCardEmbedRegistry = createSocialCardEmbedRegistry();
	const staticMarkerRegistry = createStaticMarkerRegistry();

	setContext<FormContentContext>(FORM_CONTENT_CONTEXT, {
		getRootBlocks() {
			return [];
		},
		getRootData() {
			return { body: basicValue };
		},
		getBlockRegistry() {
			return {
				entries: [],
				get: () => undefined,
				has: () => false,
				getAdapter: () => undefined
			};
		},
		getBaselineFieldValue(path) {
			return path === 'body' ? initialBasicValue : undefined;
		},
		updateSemanticFieldFingerprint(fingerprint) {
			if (fingerprint.path !== 'body') {
				return;
			}

			basicSemanticDirty = fingerprint.baselineFingerprint !== fingerprint.currentFingerprint;
		}
	});

	const referenceBlocks: BlockUsage[] = [
		{
			id: 'body',
			type: 'markdown',
			label: 'Body',
			components: ['project-gallery']
		},
		{
			id: 'galleries',
			type: 'block',
			label: 'Galleries',
			collection: true,
			itemLabel: 'Gallery',
			blocks: [
				{
					id: 'id',
					type: 'text',
					label: 'Gallery ID',
					referenceFor: 'project-gallery:galleryId'
				},
				{
					id: 'title',
					type: 'text',
					label: 'Title',
					referenceLabel: true
				}
			]
		}
	];
	const siblingObjectReferenceBlocks: BlockUsage[] = [
		{
			id: 'body',
			type: 'markdown',
			label: 'Body',
			components: ['gallery-embed']
		},
		{
			id: 'gallery',
			type: 'block',
			label: 'Gallery',
			blocks: [
				{
					id: 'referenceToken',
					type: 'text',
					label: 'Reference token',
					referenceFor: ['gallery-embed:galleryRef']
				},
				{
					id: 'title',
					type: 'text',
					label: 'Title',
					referenceLabel: true
				},
				{
					id: 'layout',
					type: 'select',
					label: 'Layout',
					options: [
						{ value: 'stack', label: 'Stack' },
						{ value: 'inline', label: 'Inline' }
					]
				}
			]
		}
	];
	const topLevelReferenceBlocks: BlockUsage[] = [
		{
			id: 'body',
			type: 'markdown',
			label: 'Body',
			components: ['hero-embed']
		},
		{
			id: 'heroToken',
			type: 'text',
			label: 'Hero token',
			referenceFor: 'hero-embed:heroRef'
		},
		{
			id: 'title',
			type: 'text',
			label: 'Title',
			referenceLabel: true
		}
	];
	const nestedObjectReferenceBlocks: BlockUsage[] = [
		{
			id: 'body',
			type: 'markdown',
			label: 'Body',
			components: ['social-card-embed']
		},
		{
			id: 'seo',
			type: 'block',
			label: 'SEO',
			blocks: [
				{
					id: 'openGraph',
					type: 'block',
					label: 'Open graph',
					blocks: [
						{
							id: 'imageToken',
							type: 'text',
							label: 'Image token',
							referenceFor: 'social-card-embed:cardRef'
						},
						{
							id: 'title',
							type: 'text',
							label: 'Title',
							referenceLabel: true
						}
					]
				},
				{
					id: 'twitterCard',
					type: 'block',
					label: 'Twitter card',
					blocks: [
						{
							id: 'imageToken',
							type: 'text',
							label: 'Image token',
							referenceFor: 'social-card-embed:cardRef'
						},
						{
							id: 'title',
							type: 'text',
							label: 'Title',
							referenceLabel: true
						}
					]
				}
			]
		}
	];

	const mockDraftAssetStore: DraftAssetStore = {
		async create(file, options) {
			createCalls = [
				...createCalls,
				{
					name: file.name,
					repoKey: options.repoKey,
					storagePath: options.storagePath
				}
			];

			return {
				ref: 'draft-asset:uploaded',
				previewUrl: 'blob:uploaded',
				metadata: {
					id: 'uploaded',
					ref: 'draft-asset:uploaded',
					repoKey: options.repoKey,
					storagePath: options.storagePath ?? 'static/images/posts/',
					originalName: file.name,
					mimeType: file.type || 'image/png',
					size: file.size,
					createdAt: '2026-04-09T10:00:00.000Z',
					targetFilename: 'hero-asset.png',
					targetPath: 'static/images/posts/hero-asset.png',
					publicPath: '/images/posts/hero-asset.png',
					byteStore: 'idb',
					byteKey: 'uploaded'
				}
			};
		},
		async readFile() {
			return new File(['image-bytes'], 'hero.png', { type: 'image/png' });
		},
		async resolveUrl(ref) {
			return urlByRef.get(ref) ?? null;
		},
		async delete(ref) {
			deleteCalls = [...deleteCalls, ref];
		},
		async getMetadata() {
			return null;
		},
		async getMetadataForContent() {
			return [];
		},
		collectFromContent() {
			return [];
		},
		async gc() {}
	};

	const basicAdapters = {
		repoKey: 'github:acme/docs',
		componentMode: 'github' as const,
		rootConfig: {
			assets: {
				path: 'static/images/posts/',
				publicPath: '/images/posts'
			}
		},
		draftAssetStore: mockDraftAssetStore,
		loadAssetEntries: async () => [
			{
				name: 'library.jpg',
				repoPath: 'static/images/posts/library.jpg',
				publicPath: '/images/posts/library.jpg',
				relativePath: 'library.jpg',
				kind: 'image' as const,
				extension: '.jpg'
			}
		],
		loadContentComponentRegistryForMode: async () => emptyRegistry
	};

	const componentAdapters = {
		repoKey: 'github:acme/docs',
		componentMode: 'github' as const,
		rootConfig: null,
		draftAssetStore: mockDraftAssetStore,
		loadContentComponentRegistryForMode: async () => buyButtonRegistry
	};
	const projectGalleryAdapters = {
		repoKey: 'github:acme/docs',
		componentMode: 'github' as const,
		rootConfig: null,
		draftAssetStore: mockDraftAssetStore,
		loadContentComponentRegistryForMode: async () => projectGalleryRegistry
	};
	const galleryEmbedAdapters = {
		repoKey: 'github:acme/docs',
		componentMode: 'github' as const,
		rootConfig: null,
		draftAssetStore: mockDraftAssetStore,
		loadContentComponentRegistryForMode: async () => galleryEmbedRegistry
	};
	const heroEmbedAdapters = {
		repoKey: 'github:acme/docs',
		componentMode: 'github' as const,
		rootConfig: null,
		draftAssetStore: mockDraftAssetStore,
		loadContentComponentRegistryForMode: async () => heroEmbedRegistry
	};
	const socialCardEmbedAdapters = {
		repoKey: 'github:acme/docs',
		componentMode: 'github' as const,
		rootConfig: null,
		draftAssetStore: mockDraftAssetStore,
		loadContentComponentRegistryForMode: async () => socialCardEmbedRegistry
	};

	function resetLogs() {
		deleteCalls = [];
		createCalls = [];
	}

	function resetBasicMarkdown() {
		basicValue = initialBasicValue;
		resetLogs();
	}

	function resetLinkMarkdown() {
		basicValue = '[Example](https://example.com/old)';
		resetLogs();
	}

	function resetUploadMarkdown() {
		basicValue = '';
		resetLogs();
	}

	function resetComponentInsertState() {
		componentValue = '';
	}

	function resetComponentEditState() {
		componentValue = ':buy-button[Buy now]{href="https://example.com/shop" variant="default"}';
	}

	function resetBrokenComponentState() {
		brokenComponentValue = ':buy-button[Old label]{href="https://example.com/old"';
		brokenComponentErrors = [];
	}

	function resetDisabledComponentState() {
		disabledComponentValue =
			':buy-button[Disabled label]{href="https://example.com/disabled" variant="secondary"}';
		disabledComponentErrors = [];
	}

	function resetReferenceInsertState() {
		referenceInsertValue = '';
		referenceInsertErrors = [];
	}

	function resetReferenceEditState() {
		referenceEditValue = '::project-gallery{galleryId="city-sketches"}';
		referenceEditErrors = [];
	}

	function resetUnresolvedReferenceState() {
		unresolvedReferenceValue = '::project-gallery{galleryId="missing-gallery"}';
		unresolvedReferenceErrors = [];
	}

	function resetSiblingObjectReferenceState() {
		siblingObjectReferenceValue = '::gallery-embed';
		siblingObjectReferenceErrors = [];
	}

	function resetTopLevelReferenceState() {
		topLevelReferenceValue = '';
		topLevelReferenceErrors = [];
	}

	function resetNestedObjectReferenceState() {
		nestedObjectReferenceValue = '';
		nestedObjectReferenceErrors = [];
	}

	function resetStaticMarkerState() {
		staticMarkerValue = '::static-marker';
		staticMarkerErrors = [];
	}

	onMount(() => {
		basicValue = initialBasicValue;
		componentValue = initialComponentValue;

		function handleHarnessAnchorClick(event: MouseEvent) {
			const target = event.target;
			if (!(target instanceof Element)) {
				return;
			}

			if (event.metaKey || event.ctrlKey) {
				return;
			}

			const anchor = target.closest('a[href]');
			if (!anchor) {
				return;
			}

			if (!target.closest('[data-testid="basic-field"], [data-testid="component-field"]')) {
				return;
			}

			event.preventDefault();
		}

		document.addEventListener('click', handleHarnessAnchorClick, true);
		return () => document.removeEventListener('click', handleHarnessAnchorClick, true);
	});

	$effect(() => {
		basicValue = initialBasicValue;
		componentValue = initialComponentValue;
		resetLogs();
	});
</script>

<svelte:head>
	<title>MarkdownField Playwright Harness</title>
</svelte:head>

{#snippet basicFieldHarness()}
	<section
		data-testid="basic-field"
		class="space-y-4 rounded-xl border border-stone-300 bg-stone-50 p-4"
	>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				data-testid="reset-basic-markdown"
				class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
				onclick={resetBasicMarkdown}
			>
				Reset basic markdown
			</button>
			<button
				type="button"
				data-testid="reset-link-markdown"
				class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
				onclick={resetLinkMarkdown}
			>
				Reset link markdown
			</button>
			<button
				type="button"
				data-testid="reset-upload-markdown"
				class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
				onclick={resetUploadMarkdown}
			>
				Reset upload markdown
			</button>
			<button
				type="button"
				data-testid="reset-asset-logs"
				class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
				onclick={resetLogs}
			>
				Reset asset logs
			</button>
		</div>

		<MarkdownField
			fieldPath="body"
			label="Body"
			bind:value={basicValue}
			storagePath="static/images/posts/"
			assetsDir="static/images/posts/"
			testAdapters={basicAdapters}
		/>

		<div class="grid gap-3 lg:grid-cols-4">
			<pre
				data-testid="basic-markdown-value"
				class="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-50">{basicValue}</pre>
			<pre
				data-testid="basic-semantic-dirty-state"
				class="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-50">{basicSemanticDirty
					? 'dirty'
					: 'clean'}</pre>
			<pre
				data-testid="draft-create-calls"
				class="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-50">{JSON.stringify(
					createCalls
				)}</pre>
			<pre
				data-testid="draft-delete-calls"
				class="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-50">{JSON.stringify(
					deleteCalls
				)}</pre>
		</div>
	</section>
{/snippet}

{#if !dev}
	<p>This route is only available in development.</p>
{:else if scenario === 'long'}
	<div class="fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)] bg-white">
		<header class="border-b border-stone-200 bg-white px-6 py-5" data-testid="workspace-header">
			<h1 class="text-2xl font-semibold text-stone-950">Home</h1>
		</header>

		<div class="min-h-0 overflow-y-auto px-4 sm:px-6" data-testid="markdown-field-scroll-panel">
			<div class="mx-auto max-w-5xl pt-4 sm:pt-6">
				{@render basicFieldHarness()}
				<PageStickyFooter>
					<button type="button" class="tm-btn tm-btn-primary">Save Changes</button>
					<button type="button" class="tm-btn tm-btn-secondary">Cancel</button>
				</PageStickyFooter>
			</div>
		</div>
	</div>
{:else}
	<div class="mx-auto max-w-5xl space-y-8 px-6 py-8">
		<header class="space-y-2">
			<h1 class="text-2xl font-semibold text-stone-950">MarkdownField Playwright Harness</h1>
			<p class="text-sm text-stone-600">
				Real-browser harness for rich markdown editor coverage without Vitest Browser Mode.
			</p>
		</header>

		{@render basicFieldHarness()}

		<section
			data-testid="component-field"
			class="space-y-4 rounded-xl border border-stone-300 bg-stone-50 p-4"
		>
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					data-testid="reset-component-insert"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetComponentInsertState}
				>
					Reset component insert
				</button>
				<button
					type="button"
					data-testid="reset-component-edit"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetComponentEditState}
				>
					Reset component edit
				</button>
			</div>

			<MarkdownField
				fieldId="component-body"
				label="Component body"
				bind:value={componentValue}
				components={['buy-button']}
				testAdapters={componentAdapters}
			/>

			<pre
				data-testid="component-markdown-value"
				class="overflow-auto rounded bg-stone-950 p-3 text-xs text-stone-50">{componentValue}</pre>
		</section>

		<section class="space-y-4">
			<div class="flex flex-wrap gap-2">
				<button
					type="button"
					data-testid="reset-broken-component"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetBrokenComponentState}
				>
					Reset broken component
				</button>
				<button
					type="button"
					data-testid="reset-disabled-component"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetDisabledComponentState}
				>
					Reset disabled component
				</button>
				<button
					type="button"
					data-testid="reset-reference-insert"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetReferenceInsertState}
				>
					Reset reference insert
				</button>
				<button
					type="button"
					data-testid="reset-reference-edit"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetReferenceEditState}
				>
					Reset reference edit
				</button>
				<button
					type="button"
					data-testid="reset-unresolved-reference"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetUnresolvedReferenceState}
				>
					Reset unresolved reference
				</button>
				<button
					type="button"
					data-testid="reset-sibling-object-reference"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetSiblingObjectReferenceState}
				>
					Reset sibling object reference
				</button>
				<button
					type="button"
					data-testid="reset-top-level-reference"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetTopLevelReferenceState}
				>
					Reset top-level reference
				</button>
				<button
					type="button"
					data-testid="reset-nested-object-reference"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetNestedObjectReferenceState}
				>
					Reset nested object reference
				</button>
				<button
					type="button"
					data-testid="reset-static-marker"
					class="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm"
					onclick={resetStaticMarkerState}
				>
					Reset static marker
				</button>
			</div>

			<MarkdownFieldPlaywrightHarness
				testId="broken-component-field"
				label="Broken component body"
				bind:value={brokenComponentValue}
				bind:validationErrors={brokenComponentErrors}
				components={['buy-button']}
				testAdapters={componentAdapters}
			/>

			<MarkdownFieldPlaywrightHarness
				testId="disabled-component-field"
				label="Disabled component body"
				bind:value={disabledComponentValue}
				bind:validationErrors={disabledComponentErrors}
				components={[]}
				testAdapters={componentAdapters}
			/>

			<MarkdownFieldPlaywrightHarness
				testId="reference-insert-field"
				label="Reference insert body"
				bind:value={referenceInsertValue}
				bind:validationErrors={referenceInsertErrors}
				components={['project-gallery']}
				rootBlocks={referenceBlocks}
				rootData={{
					body: referenceInsertValue,
					galleries: [
						{ id: 'city-sketches', title: 'City sketches' },
						{ id: 'paper-notes', title: 'Paper notes' }
					]
				}}
				testAdapters={projectGalleryAdapters}
			/>

			<MarkdownFieldPlaywrightHarness
				testId="reference-edit-field"
				label="Reference edit body"
				bind:value={referenceEditValue}
				bind:validationErrors={referenceEditErrors}
				components={['project-gallery']}
				rootBlocks={referenceBlocks}
				rootData={{
					body: referenceEditValue,
					galleries: [
						{ id: 'city-sketches', title: 'City sketches' },
						{ id: 'paper-notes', title: 'Paper notes' }
					]
				}}
				testAdapters={projectGalleryAdapters}
			/>
			<div
				data-field-path="galleries[0].id"
				data-testid="reference-edit-source"
				class="rounded-lg border border-dashed border-stone-300 bg-white p-3"
			>
				<label class="grid gap-1 text-sm text-stone-700">
					<span class="font-medium">Gallery ID source</span>
					<input
						readonly
						value="city-sketches"
						aria-label="Gallery ID source"
						class="rounded border border-stone-300 px-3 py-2"
					/>
				</label>
			</div>

			<MarkdownFieldPlaywrightHarness
				testId="unresolved-reference-field"
				label="Unresolved reference body"
				bind:value={unresolvedReferenceValue}
				bind:validationErrors={unresolvedReferenceErrors}
				components={['project-gallery']}
				rootBlocks={referenceBlocks}
				rootData={{
					body: unresolvedReferenceValue,
					galleries: [{ id: 'city-sketches', title: 'City sketches' }]
				}}
				testAdapters={projectGalleryAdapters}
			/>

			<MarkdownFieldPlaywrightHarness
				testId="sibling-object-reference-field"
				label="Sibling object reference body"
				bind:value={siblingObjectReferenceValue}
				bind:validationErrors={siblingObjectReferenceErrors}
				components={['gallery-embed']}
				rootBlocks={siblingObjectReferenceBlocks}
				rootData={{
					body: siblingObjectReferenceValue,
					gallery: {
						referenceToken: 'main',
						title: 'Homepage gallery',
						layout: 'inline'
					}
				}}
				testAdapters={galleryEmbedAdapters}
			/>
			<div
				data-field-path="gallery"
				data-testid="sibling-object-reference-source"
				class="rounded-lg border border-dashed border-stone-300 bg-white p-3"
			>
				<label class="grid gap-1 text-sm text-stone-700">
					<span class="font-medium">Gallery source field</span>
					<input
						readonly
						value="Homepage gallery"
						aria-label="Gallery source field"
						class="rounded border border-stone-300 px-3 py-2"
					/>
				</label>
			</div>

			<MarkdownFieldPlaywrightHarness
				testId="top-level-reference-field"
				label="Top-level reference body"
				bind:value={topLevelReferenceValue}
				bind:validationErrors={topLevelReferenceErrors}
				components={['hero-embed']}
				rootBlocks={topLevelReferenceBlocks}
				rootData={{
					body: topLevelReferenceValue,
					heroToken: 'main-hero',
					title: 'Homepage hero'
				}}
				testAdapters={heroEmbedAdapters}
			/>

			<MarkdownFieldPlaywrightHarness
				testId="nested-object-reference-field"
				label="Nested object reference body"
				bind:value={nestedObjectReferenceValue}
				bind:validationErrors={nestedObjectReferenceErrors}
				components={['social-card-embed']}
				rootBlocks={nestedObjectReferenceBlocks}
				rootData={{
					body: nestedObjectReferenceValue,
					seo: {
						openGraph: {
							imageToken: 'og-cover',
							title: 'Open graph cover'
						},
						twitterCard: {
							imageToken: 'twitter-cover',
							title: 'Twitter card cover'
						}
					}
				}}
				testAdapters={socialCardEmbedAdapters}
			/>

			<MarkdownFieldPlaywrightHarness
				testId="static-marker-field"
				label="Static marker body"
				bind:value={staticMarkerValue}
				bind:validationErrors={staticMarkerErrors}
				components={['static-marker']}
				testAdapters={{
					loadContentComponentRegistryForMode: async () => staticMarkerRegistry
				}}
			/>
		</section>
	</div>
{/if}
