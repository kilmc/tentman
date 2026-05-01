<script lang="ts">
	import { Switch } from 'bits-ui';

	interface Props {
		label: string;
		value: boolean;
		required?: boolean;
		onchange?: () => void;
	}

	let { label, value = $bindable(false), required = false, onchange }: Props = $props();
</script>

<div class="mb-4 rounded-xl border border-stone-200 bg-white px-4 py-3">
	<div class="flex items-center justify-between gap-4">
		<div class="min-w-0">
			<div class="text-sm font-medium text-stone-900">
				{label}
				{#if required}
					<span class="text-red-600">*</span>
				{/if}
			</div>
			<p class="mt-1 text-xs text-stone-500">On/off setting</p>
		</div>

		<Switch.Root
			bind:checked={value}
			{required}
			aria-label={label}
			onCheckedChange={() => onchange?.()}
			class="group inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border border-stone-300 bg-stone-200 p-0.5 transition-colors outline-none data-[state=checked]:border-stone-900 data-[state=checked]:bg-stone-900 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
		>
			<Switch.Thumb
				class="block h-5.5 w-5.5 rounded-full bg-white shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-5"
			/>
		</Switch.Root>
	</div>
</div>
