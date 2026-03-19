<script lang="ts">
	import type { BlockUsage } from '$lib/config/types';
	import type { BlockRegistry } from '$lib/blocks/registry';
	import { buildBlockFormData } from '$lib/features/forms/helpers';
	import type { ContentRecord } from '$lib/features/content-management/types';
	import FormField from './FormField.svelte';

	interface Props {
		label: string;
		value: any[];
		blocks?: BlockUsage[];
		required?: boolean;
		onchange?: () => void;
		imagePath?: string;
		blockRegistry: BlockRegistry;
	}

	let {
		label,
		value = $bindable([]),
		blocks = [],
		required = false,
		onchange,
		imagePath,
		blockRegistry
	}: Props = $props();

	function addItem() {
		const newItem: ContentRecord = buildBlockFormData(blocks, {}, blockRegistry);
		value = [...value, newItem];
		onchange?.();
	}

	function removeItem(index: number) {
		value = value.filter((_, i) => i !== index);
		onchange?.();
	}
</script>

<fieldset class="mb-4">
	<div class="mb-2 flex items-center justify-between">
		<legend class="text-sm font-medium text-gray-700">
			{label}
			{#if required}
				<span class="text-red-600">*</span>
			{/if}
		</legend>
		<button
			type="button"
			onclick={addItem}
			class="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
		>
			Add Item
		</button>
	</div>

	{#if value.length === 0}
		<div class="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 p-8 text-center">
			<div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white">
				<svg class="h-6 w-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
			</div>
			<p class="text-sm font-medium text-gray-700 mb-1">No items yet</p>
			<p class="text-xs text-gray-500">Click "Add Item" above to get started</p>
		</div>
	{:else}
		<div class="space-y-4">
			{#each value as item, index}
				<div class="rounded border border-gray-300 bg-gray-50 p-4">
					<div class="mb-3 flex items-center justify-between">
						<span class="text-sm font-medium text-gray-700">Item {index + 1}</span>
						<button
							type="button"
							onclick={() => removeItem(index)}
							class="text-xs text-red-600 hover:underline"
						>
							Remove
						</button>
					</div>

					{#if blocks.length > 0}
						<div class="space-y-2">
							{#each blocks as block}
								<FormField
									{block}
									bind:value={value[index][block.id]}
									{imagePath}
									{blockRegistry}
									onchange={() => onchange?.()}
								/>
							{/each}
						</div>
					{:else}
						<input
							type="text"
							bind:value={value[index]}
							oninput={() => onchange?.()}
							class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</fieldset>
