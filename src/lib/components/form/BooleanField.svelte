<script lang="ts">
	interface Props {
		label: string;
		value: boolean;
		required?: boolean;
		onchange?: () => void;
	}

	let { label, value = $bindable(false), required = false, onchange }: Props = $props();
</script>

<div class="mb-4">
	<label class="flex items-center gap-2 text-sm font-medium text-gray-700">
		<input
			type="checkbox"
			bind:checked={value}
			{required}
			onchange={() => onchange?.()}
			class="h-4 w-4 rounded-sm border-gray-300 text-stone-900 focus:ring-2 focus:ring-stone-900"
		/>
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>
</div>
