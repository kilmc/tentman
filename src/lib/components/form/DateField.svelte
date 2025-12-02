<script lang="ts">
	interface Props {
		label: string;
		value: string;
		required?: boolean;
		onchange?: () => void;
	}

	let { label, value = $bindable(''), required = false, onchange }: Props = $props();
</script>

<div class="mb-4">
	<label class="mb-1 block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>
	<input
		type="date"
		bind:value
		{required}
		oninput={() => onchange?.()}
		class="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
	/>
</div>
