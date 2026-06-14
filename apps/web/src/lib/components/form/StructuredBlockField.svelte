<script lang="ts">
	import type { BlockUsage, EditorLayoutConfig } from '$lib/config/types';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
	import { buildBlockFormData } from '$lib/features/forms/helpers';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import StructuredFieldsLayout from './StructuredFieldsLayout.svelte';

	interface Props {
		label: string;
		blocks: BlockUsage[];
		value: ContentRecord;
		fieldPath?: string;
		required?: boolean;
		onchange?: () => void;
		imagePath?: string;
		configPath?: string;
		defaultAssetStoragePath?: string;
		editorLayout?: EditorLayoutConfig;
		blockRegistry: BlockRegistry;
		navigationManifest?: NavigationManifest | null;
		onaddselectoption?: (input: {
			collection: string;
			id: string;
			value: string;
			label: string;
		}) => Promise<void>;
	}

	let {
		label,
		blocks,
		value = $bindable({}),
		fieldPath,
		required = false,
		onchange,
		imagePath,
		configPath,
		defaultAssetStoragePath,
		editorLayout,
		blockRegistry,
		navigationManifest,
		onaddselectoption
	}: Props = $props();

	$effect(() => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			value = buildBlockFormData(blocks, {}, blockRegistry);
		}
	});
</script>

<fieldset class="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
	<legend class="px-1 text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</legend>

	<StructuredFieldsLayout
		{blocks}
		bind:value
		{fieldPath}
		{imagePath}
		{configPath}
		{defaultAssetStoragePath}
		{blockRegistry}
		{navigationManifest}
		{onaddselectoption}
		{editorLayout}
		onchange={() => onchange?.()}
	/>
</fieldset>
