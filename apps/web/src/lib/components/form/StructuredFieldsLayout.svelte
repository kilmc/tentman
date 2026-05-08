<script lang="ts">
	import { onMount } from 'svelte';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import type { BlockUsage, EditorLayoutConfig } from '$lib/config/types';
	import { getBlockStorageKey } from '$lib/config/tentman-group';
	import {
		EDITOR_ASIDE_WIDE_THRESHOLD_PX,
		resolveStructuredEditorSections
	} from '$lib/features/forms/editor-layout';
	import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import FormField from './FormField.svelte';

	interface Props {
		blocks: BlockUsage[];
		value: ContentRecord;
		fieldPath?: string;
		imagePath?: string;
		blockRegistry: BlockRegistry;
		navigationManifest?: NavigationManifest | null;
		onaddselectoption?: (input: {
			collection: string;
			id: string;
			value: string;
			label: string;
		}) => Promise<void>;
		onchange?: (fieldName: string) => void;
		getFieldError?: (fieldName: string) => string | undefined;
		showValidationErrors?: boolean;
		editorLayout?: EditorLayoutConfig;
	}

	let {
		blocks,
		value,
		fieldPath,
		imagePath,
		blockRegistry,
		navigationManifest,
		onaddselectoption,
		onchange,
		getFieldError,
		showValidationErrors = false,
		editorLayout
	}: Props = $props();

	let container = $state<HTMLDivElement | null>(null);
	let isWide = $state(false);
	let manualAsideOpen = $state<boolean | null>(null);

	const sections = $derived(resolveStructuredEditorSections(blocks, editorLayout));
	const asideOpen = $derived(manualAsideOpen ?? isWide);

	onMount(() => {
		if (!container || typeof ResizeObserver === 'undefined') {
			return;
		}

		const observer = new ResizeObserver((entries) => {
			const nextWidth = entries[0]?.contentRect.width ?? 0;
			isWide = nextWidth >= EDITOR_ASIDE_WIDE_THRESHOLD_PX;
		});

		observer.observe(container);

		return () => observer.disconnect();
	});

	function getFieldPath(block: BlockUsage): string {
		const storageKey = getBlockStorageKey(block);
		return fieldPath ? `${fieldPath}.${storageKey}` : storageKey;
	}

	function getError(block: BlockUsage): string | undefined {
		return getFieldError?.(getFieldPath(block));
	}

	function toggleAside() {
		manualAsideOpen = !(manualAsideOpen ?? isWide);
	}
</script>

<div
	bind:this={container}
	class="@container/structured-form min-w-0"
	data-layout-mode={isWide ? 'wide' : 'stacked'}
	data-aside-open={sections.hasAside ? String(asideOpen) : undefined}
>
	<div class="grid min-w-0 gap-6 @4xl/structured-form:grid-cols-[minmax(0,1fr)_18rem] @4xl/structured-form:items-start">
		<div class="min-w-0 space-y-4">
			{#each sections.primaryBlocks as block (block.id)}
				<div>
					<FormField
						{block}
						bind:value={value[getBlockStorageKey(block)]}
						fieldPath={getFieldPath(block)}
						{imagePath}
						{blockRegistry}
						{navigationManifest}
						{onaddselectoption}
						onchange={() => onchange?.(getFieldPath(block))}
					/>
					{#if showValidationErrors && getError(block)}
						<div class="mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
							<svg class="mt-0.5 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path
									fill-rule="evenodd"
									d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
									clip-rule="evenodd"
								/>
							</svg>
							<span class="font-medium">{getError(block)}</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		{#if sections.hasAside}
			<section
				class="min-w-0 rounded-lg border border-stone-200 bg-stone-50/80 @4xl/structured-form:sticky @4xl/structured-form:top-4"
				aria-label={sections.asideLabel}
			>
				<button
					type="button"
					class="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left"
					onclick={toggleAside}
					aria-expanded={asideOpen}
				>
					<div class="min-w-0">
						<p class="text-[0.7rem] font-semibold tracking-[0.16em] text-stone-500 uppercase">
							{sections.asideLabel}
						</p>
						<p class="mt-0.5 text-sm text-stone-600">
							{sections.asideBlocks.length} {sections.asideBlocks.length === 1 ? 'field' : 'fields'}
						</p>
					</div>
					<svg
						class={`h-4 w-4 text-stone-500 transition-transform ${asideOpen ? 'rotate-180' : ''}`}
						viewBox="0 0 20 20"
						fill="currentColor"
						aria-hidden="true"
					>
						<path
							fill-rule="evenodd"
							d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 011.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
							clip-rule="evenodd"
						/>
					</svg>
				</button>

				{#if asideOpen}
					<div class="border-t border-stone-200 px-4 py-4">
						<div class="space-y-4">
							{#each sections.asideBlocks as block (block.id)}
								<div>
									<FormField
										{block}
										bind:value={value[getBlockStorageKey(block)]}
										fieldPath={getFieldPath(block)}
										{imagePath}
										{blockRegistry}
										{navigationManifest}
										{onaddselectoption}
										onchange={() => onchange?.(getFieldPath(block))}
									/>
									{#if showValidationErrors && getError(block)}
										<div class="mt-1.5 flex items-start gap-1.5 text-sm text-red-700">
											<svg
												class="mt-0.5 h-4 w-4 flex-shrink-0"
												fill="currentColor"
												viewBox="0 0 20 20"
											>
												<path
													fill-rule="evenodd"
													d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
													clip-rule="evenodd"
												/>
											</svg>
											<span class="font-medium">{getError(block)}</span>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</section>
		{/if}
	</div>
</div>
