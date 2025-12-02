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
</script>

<div class="mb-4">
	<label class="mb-1 block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>
	<input
		type="number"
		bind:value
		{placeholder}
		{required}
		{min}
		{max}
		{step}
		oninput={() => onchange?.()}
		class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
	/>
</div>
