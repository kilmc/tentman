<script lang="ts">
	interface Props {
		label: string;
		value: number;
		required?: boolean;
		placeholder?: string;
		min?: number;
		max?: number;
		step?: number;
		onchange?: () => void;
	}

	let {
		label,
		value = $bindable(0),
		required = false,
		placeholder = '',
		min,
		max,
		step = 1,
		onchange
	}: Props = $props();

	const inputId = `number-field-${Math.random().toString(36).substring(2, 9)}`;
</script>

<div class="mb-4">
	<label for={inputId} class="mb-1 block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>
	<input
		id={inputId}
		type="number"
		bind:value
		{placeholder}
		{required}
		{min}
		{max}
		{step}
		oninput={() => onchange?.()}
		class="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
	/>
</div>
