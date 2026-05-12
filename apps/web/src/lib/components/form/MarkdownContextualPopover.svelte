<script lang="ts">
	import { tick } from 'svelte';
	import { Popover } from 'bits-ui';

	interface PopoverState {
		kind: 'link' | 'component';
		href: string;
		placement: 'above' | 'below';
		editLabel?: string;
	}

	interface Props {
		open: boolean;
		anchor: HTMLDivElement | null;
		popover: PopoverState;
		linkMode: 'view' | 'edit';
		linkValue: string;
		onopenchange: (open: boolean) => void;
		onlinkvaluechange: (value: string) => void;
		onstartlinkedit: () => void;
		onsubmitlinkedit: () => void;
		oncancellinkedit: () => void;
		onedittarget: () => void;
		onopencurrenthref: () => void;
		onremovecurrentlink: () => void;
	}

	let {
		open,
		anchor,
		popover,
		linkMode,
		linkValue,
		onopenchange,
		onlinkvaluechange,
		onstartlinkedit,
		onsubmitlinkedit,
		oncancellinkedit,
		onedittarget,
		onopencurrenthref,
		onremovecurrentlink
	}: Props = $props();

	let input = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!open || popover.kind !== 'link' || linkMode !== 'edit') {
			return;
		}

		void tick().then(() => {
			input?.focus();
			input?.select();
		});
	});
</script>

<Popover.Root {open} onOpenChange={onopenchange}>
	<Popover.Portal>
		<Popover.Content
			customAnchor={anchor}
			side={popover.placement === 'above' ? 'top' : 'bottom'}
			sideOffset={12}
			align="center"
			trapFocus={false}
			onCloseAutoFocus={(event) => event.preventDefault()}
			class="z-40 w-[min(24rem,calc(100vw-1rem))] rounded-lg border border-stone-200 bg-white p-3 shadow-xl focus:outline-none"
			aria-label={popover.kind === 'link' ? 'Link actions' : 'Content component link actions'}
		>
			{#if popover.kind === 'link' && linkMode === 'edit'}
				<form
					class="space-y-3"
					onsubmit={(event) => {
						event.preventDefault();
						onsubmitlinkedit();
					}}
				>
					<label class="block text-sm font-medium text-stone-700">
						<span class="mb-1 block">URL</span>
						<input
							bind:this={input}
							class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
							type="url"
							value={linkValue}
							placeholder="https://example.com"
							oninput={(event) => onlinkvaluechange(event.currentTarget.value)}
						/>
					</label>

					<div class="flex flex-wrap justify-end gap-2">
						<button
							type="button"
							class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
							onclick={oncancellinkedit}
						>
							Cancel
						</button>
						<button
							type="submit"
							class="rounded-md border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
						>
							Save link
						</button>
					</div>
				</form>
			{:else}
				<div class="flex flex-wrap gap-2">
					<p class="min-w-full break-all text-sm text-stone-900">{popover.href}</p>
					<button
						type="button"
						class="rounded-md border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
						onclick={popover.kind === 'link' ? onstartlinkedit : onedittarget}
					>
						{popover.kind === 'link' ? 'Edit link' : `Edit ${popover.editLabel ?? 'item'}`}
					</button>
					<button
						type="button"
						class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
						onclick={onopencurrenthref}
					>
						Open link
					</button>
					{#if popover.kind === 'link'}
						<button
							type="button"
							class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
							onclick={onremovecurrentlink}
						>
							Remove link
						</button>
					{/if}
				</div>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
