<script lang="ts">
	import type { ToastAction } from '$lib/stores/toasts';

	type ToastType = 'success' | 'error' | 'info' | 'warning';

	let {
		message,
		type = 'info',
		duration = 3000,
		action,
		onClose
	}: {
		message: string;
		type?: ToastType;
		duration?: number;
		action?: ToastAction;
		onClose?: () => void;
	} = $props();

	let visible = $state(true);
	let closing = $state(false);

	// Auto-hide after duration
	$effect(() => {
		if (duration > 0) {
			const timer = setTimeout(() => {
				close();
			}, duration);

			return () => clearTimeout(timer);
		}
	});

	const typeStyles: Record<ToastType, string> = {
		success: 'border-green-300 bg-green-50 text-green-900',
		error: 'border-red-300 bg-red-50 text-red-900',
		warning: 'border-yellow-300 bg-yellow-50 text-yellow-900',
		info: 'border-blue-300 bg-blue-50 text-blue-900'
	};

	const icons: Record<ToastType, string> = {
		success: '✓',
		error: '✗',
		warning: '⚠',
		info: 'ℹ'
	};

	function close() {
		closing = true;
		// Wait for animation to complete before hiding
		setTimeout(() => {
			visible = false;
			onClose?.();
		}, 300);
	}

	function handleAction() {
		action?.callback();
		close();
	}
</script>

{#if visible}
	<div
		class="pointer-events-auto flex min-w-80 max-w-md flex-col gap-3 rounded-lg border-2 p-5 shadow-2xl {closing
			? 'animate-slideOutRight'
			: 'animate-slideInRight'} {typeStyles[type]}"
		role="alert"
	>
		<div class="flex items-start gap-3">
			<span class="text-xl font-bold" aria-hidden="true">{icons[type]}</span>
			<div class="flex-1">
				<p class="font-medium leading-relaxed">{message}</p>
			</div>
			<button
				type="button"
				onclick={close}
				class="text-lg font-bold opacity-60 transition-opacity hover:opacity-100"
				aria-label="Close notification"
			>
				×
			</button>
		</div>
		{#if action}
			<div class="ml-8 flex justify-start">
				<button
					type="button"
					onclick={handleAction}
					class="rounded-md bg-black/10 px-3 py-1.5 text-sm font-semibold transition-colors hover:bg-black/20"
				>
					{action.label}
				</button>
			</div>
		{/if}
	</div>
{/if}
