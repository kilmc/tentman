<script lang="ts">
	import type { BlockUsage } from '$lib/config/types';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { buildBlockFormData } from '$lib/features/forms/helpers';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import FormField from './FormField.svelte';

	interface Props {
		label: string;
		blocks: BlockUsage[];
		value: ContentRecord;
		fieldPath?: string;
		required?: boolean;
		onchange?: () => void;
		imagePath?: string;
		blockRegistry: BlockRegistry;
	}

	let {
		label,
		blocks,
		value = $bindable({}),
		fieldPath,
		required = false,
		onchange,
		imagePath,
		blockRegistry
	}: Props = $props();

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		value = buildBlockFormData(blocks, {}, blockRegistry);
	}
</script>

<fieldset class="mb-4 rounded border border-gray-200 bg-gray-50 p-4">
	<legend class="px-1 text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</legend>

	<div class="space-y-3">
		{#each blocks as block}
			<FormField
				{block}
				bind:value={value[block.id]}
				fieldPath={fieldPath ? `${fieldPath}.${block.id}` : block.id}
				{imagePath}
				{blockRegistry}
				onchange={() => onchange?.()}
			/>
		{/each}
	</div>
</fieldset>
