<script lang="ts">
	import { formatShortcut } from '$lib/utils/keyboard';

	let showHelp = $state(false);

	const isMac =
		typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

	const shortcuts = [
		{
			name: 'Save changes',
			keys: formatShortcut({ key: 's', meta: isMac, ctrl: !isMac })
		},
		{
			name: 'Cancel/Close',
			keys: formatShortcut({ key: 'Escape' })
		}
	];

	function toggleHelp() {
		showHelp = !showHelp;
	}
</script>

<div class="fixed bottom-6 left-6 z-40">
	<button
		type="button"
		onclick={toggleHelp}
		class="flex items-center gap-2 rounded-full bg-gray-800 px-4 py-2 text-sm text-white shadow-lg hover:bg-gray-700 transition-colors"
		aria-label="Keyboard shortcuts"
	>
		<span class="text-lg">⌨️</span>
		<span class="hidden sm:inline">Shortcuts</span>
	</button>

	{#if showHelp}
		<div class="absolute bottom-14 left-0 w-72 rounded-lg border border-gray-200 bg-white p-4 shadow-xl animate-scaleIn">
			<div class="mb-3 flex items-center justify-between">
				<h3 class="font-semibold text-gray-900">Keyboard Shortcuts</h3>
				<button
					type="button"
					onclick={toggleHelp}
					class="text-gray-400 hover:text-gray-600 transition-colors"
					aria-label="Close"
				>
					×
				</button>
			</div>

			<dl class="space-y-2">
				{#each shortcuts as shortcut}
					<div class="flex items-center justify-between text-sm">
						<dt class="text-gray-700">{shortcut.name}</dt>
						<dd class="rounded bg-gray-100 px-2 py-1 font-mono text-xs font-semibold text-gray-800">
							{shortcut.keys}
						</dd>
					</div>
				{/each}
			</dl>

			<p class="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500">
				Press these keys while editing to perform quick actions.
			</p>
		</div>
	{/if}
</div>
