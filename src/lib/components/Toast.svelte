<script lang="ts">
	type ToastType = 'success' | 'error' | 'info' | 'warning';

	let {
		message,
		type = 'info',
		duration = 3000,
		onClose
	}: {
		message: string;
		type?: ToastType;
		duration?: number;
		onClose?: () => void;
	} = $props();

	let visible = $state(true);

	// Auto-hide after duration
	$effect(() => {
		if (duration > 0) {
			const timer = setTimeout(() => {
				visible = false;
				onClose?.();
			}, duration);

			return () => clearTimeout(timer);
		}
	});

	const typeStyles: Record<ToastType, string> = {
		success: 'border-green-200 bg-green-50 text-green-800',
		error: 'border-red-200 bg-red-50 text-red-800',
		warning: 'border-yellow-200 bg-yellow-50 text-yellow-800',
		info: 'border-blue-200 bg-blue-50 text-blue-800'
	};

	const icons: Record<ToastType, string> = {
		success: '✓',
		error: '✗',
		warning: '⚠',
		info: 'ℹ'
	};

	function close() {
		visible = false;
		onClose?.();
	}
</script>

{#if visible}
	<div
		class="pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all {typeStyles[
			type
		]}"
		role="alert"
	>
		<span class="text-lg font-semibold" aria-hidden="true">{icons[type]}</span>
		<div class="flex-1">
			<p class="text-sm font-medium">{message}</p>
		</div>
		<button
			type="button"
			onclick={close}
			class="text-sm font-semibold opacity-70 hover:opacity-100"
			aria-label="Close notification"
		>
			×
		</button>
	</div>
{/if}
