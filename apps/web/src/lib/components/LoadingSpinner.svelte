<script lang="ts">
	interface Props {
		size?: 'sm' | 'md' | 'lg';
		variant?: 'primary' | 'white' | 'gray';
		label?: string;
		inline?: boolean; // Display inline with label
	}

	let { size = 'md', variant = 'primary', label, inline = false }: Props = $props();

	// Size classes
	const sizeClasses = {
		sm: 'h-4 w-4 border-2',
		md: 'h-8 w-8 border-3',
		lg: 'h-12 w-12 border-4'
	};

	// Variant classes
	const variantClasses = {
		primary: 'border-gray-200 border-t-blue-600',
		white: 'border-white/30 border-t-white',
		gray: 'border-gray-300 border-t-gray-600'
	};

	const spinnerClass = `${sizeClasses[size]} ${variantClasses[variant]} animate-spin rounded-full`;
</script>

<div class={inline ? 'inline-flex items-center gap-2' : 'flex flex-col items-center gap-3'}>
	<div class={spinnerClass}></div>
	{#if label}
		<p class="text-sm text-gray-600">{label}</p>
	{/if}
</div>
