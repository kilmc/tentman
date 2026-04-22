<script lang="ts">
	import type { SelectBlockOptions } from '$lib/config/types';

	interface Props {
		label: string;
		value: string;
		options?: SelectBlockOptions;
		required?: boolean;
		onchange?: () => void;
	}

	let {
		label,
		value = $bindable(''),
		options = [],
		required = false,
		onchange
	}: Props = $props();

	const selectId = `select-field-${Math.random().toString(36).substring(2, 9)}`;
</script>

<div class="mb-4">
	<label for={selectId} class="mb-1 block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>
	<select
		id={selectId}
		bind:value
		{required}
		onchange={() => onchange?.()}
		class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
	>
		<option value="" disabled={required}>Select {label}</option>
		{#each options as option (option.value)}
			<option value={option.value}>{option.label}</option>
		{/each}
	</select>
</div>
