<script lang="ts">
	import Toast from './Toast.svelte';
	import { toasts } from '$lib/stores/toasts';
</script>

<div class="pointer-events-none fixed bottom-0 right-0 z-50 p-6">
	<div class="flex flex-col gap-3">
		{#each $toasts as toast (toast.id)}
			<Toast
				message={toast.message}
				type={toast.type}
				duration={toast.duration}
				onClose={() => toasts.remove(toast.id)}
			/>
		{/each}
	</div>
</div>
