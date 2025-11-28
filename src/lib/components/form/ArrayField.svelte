<script lang="ts">
	import type { FieldDefinition } from '$lib/types/config';
	import FormField from './FormField.svelte';

	interface Props {
		label: string;
		value: any[];
		fields?: Record<string, FieldDefinition>;
		required?: boolean;
		onchange?: (value: any[]) => void;
	}

	let { label, value = $bindable([]), fields = {}, required = false, onchange }: Props = $props();

	function addItem() {
		// Create new item with default values based on field types
		const newItem: any = {};
		for (const [fieldName, fieldDef] of Object.entries(fields)) {
			const fieldType = typeof fieldDef === 'string' ? fieldDef : fieldDef.type;
			switch (fieldType) {
				case 'boolean':
					newItem[fieldName] = false;
					break;
				case 'number':
					newItem[fieldName] = 0;
					break;
				case 'array':
					newItem[fieldName] = [];
					break;
				default:
					newItem[fieldName] = '';
			}
		}
		value = [...value, newItem];
		onchange?.(value);
	}

	function removeItem(index: number) {
		value = value.filter((_, i) => i !== index);
		onchange?.(value);
	}

	function updateItem(index: number, fieldName: string, fieldValue: any) {
		value = value.map((item, i) => (i === index ? { ...item, [fieldName]: fieldValue } : item));
		onchange?.(value);
	}
</script>

<div class="mb-4">
	<div class="mb-2 flex items-center justify-between">
		<label class="text-sm font-medium text-gray-700">
			{label}
			{#if required}
				<span class="text-red-600">*</span>
			{/if}
		</label>
		<button
			type="button"
			onclick={addItem}
			class="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
		>
			Add Item
		</button>
	</div>

	{#if value.length === 0}
		<div class="rounded border border-gray-300 bg-gray-50 p-4 text-center text-sm text-gray-500">
			No items yet. Click "Add Item" to create one.
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

					{#if Object.keys(fields).length > 0}
						<div class="space-y-2">
							{#each Object.entries(fields) as [fieldName, fieldDef]}
								<FormField
									{fieldName}
									{fieldDef}
									value={item[fieldName]}
									onchange={(newValue) => updateItem(index, fieldName, newValue)}
								/>
							{/each}
						</div>
					{:else}
						<input
							type="text"
							value={item}
							oninput={(e) => updateItem(index, '', e.currentTarget.value)}
							class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
						/>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
