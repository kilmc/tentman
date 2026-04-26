<script lang="ts">
	import { getContext, hasContext } from 'svelte';
	import MoreHorizontal from 'lucide-svelte/icons/more-horizontal';
	import Trash2 from 'lucide-svelte/icons/trash-2';
	import type { FormSidePanelState } from '$lib/features/forms/side-panel';
	import {
		FORM_SIDE_PANEL,
		type FormSidePanelContext
	} from '$lib/features/forms/side-panel';
	import type { ContentValue } from '$lib/features/content-management/types';
	import SidePanelField from './SidePanelField.svelte';

	interface Props {
		panel: FormSidePanelState;
		framed?: boolean;
	}

	let { panel, framed = true }: Props = $props();
	let panelElement = $state<HTMLElement | null>(null);
	let actionMenu = $state<HTMLDetailsElement | null>(null);
	const sidePanel = hasContext(FORM_SIDE_PANEL)
		? getContext<FormSidePanelContext>(FORM_SIDE_PANEL)
		: null;

	const isDirty = $derived(panel.isDirty);
	const primaryActionLabel = $derived(panel.mode === 'create' ? 'Add' : 'Save');
	const showFooter = $derived(panel.mode === 'create' || isDirty || !!panel.submitError);
	const canRemove = $derived(panel.kind === 'repeatable' && panel.mode === 'edit');

	function getPanelKey(panel: FormSidePanelState): string {
		return [panel.id, panel.mode, panel.selectedIndex, panel.title].join(':');
	}

	function handleFieldChange(blockId: string, value: ContentValue | undefined) {
		sidePanel?.session?.updatePanelField(blockId, value);
	}

	function saveChanges() {
		if (!isDirty || !sidePanel?.session) {
			return;
		}

		sidePanel.session.commitPanel();
	}

	function closePanel() {
		sidePanel?.session?.closePanel();
	}

	function cancelPanel() {
		sidePanel?.session?.discardPanel();
	}

	function removeItem() {
		sidePanel?.session?.removePanelItem();
	}

	$effect(() => {
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target;
			if (!(target instanceof Node) || !panelElement || panelElement.contains(target)) {
				return;
			}

			closePanel();
		};

		document.addEventListener('pointerdown', handlePointerDown, true);
		return () => document.removeEventListener('pointerdown', handlePointerDown, true);
	});
</script>

{#key getPanelKey(panel)}
	<aside
		bind:this={panelElement}
		class="grid h-full max-h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white"
		class:rounded-md={framed}
		class:border={framed}
		class:border-stone-200={framed}
		aria-label={`${panel.label} editor`}
	>
		<div class="grid gap-3 border-b border-stone-200 px-4 py-4">
			<div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
				<div class="min-w-0">
					<p class="text-[0.7rem] font-semibold tracking-[0.16em] text-stone-500 uppercase">
						{panel.label}
					</p>
					<div class="flex min-w-0 items-center gap-2">
						<h3 class="truncate text-sm font-semibold text-stone-900">{panel.title}</h3>
						{#if isDirty}
							<span
								class="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-800"
							>
								Unsaved
							</span>
						{/if}
					</div>
				</div>
				{#if canRemove}
					<details bind:this={actionMenu} class="relative">
						<summary class="tm-icon-btn list-none" aria-label={`${panel.title} actions`}>
							<MoreHorizontal class="h-4 w-4" />
						</summary>
						<div
							class="absolute top-full right-0 z-20 mt-2 grid min-w-44 gap-1 rounded-md border border-stone-200 bg-white p-1.5 shadow-lg"
						>
							<button
								type="button"
								onclick={() => {
									actionMenu?.removeAttribute('open');
									removeItem();
								}}
								class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
								aria-label={`Remove ${panel.title}`}
							>
								<Trash2 class="h-4 w-4" />
								<span>Remove {panel.label}</span>
							</button>
						</div>
					</details>
				{/if}
			</div>
		</div>

		<div class="min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
			<div class="grid gap-2">
				{#each panel.blocks as block (block.id)}
					<SidePanelField
						{panel}
						{block}
						item={panel.selectedItem}
						onfieldchange={handleFieldChange}
					/>
				{/each}
			</div>
		</div>

		{#if showFooter}
			<div
				class={panel.mode === 'create'
					? 'grid grid-cols-2 gap-2 border-t border-stone-200 px-4 py-4'
					: 'grid grid-cols-1 gap-2 border-t border-stone-200 px-4 py-4'}
			>
				{#if panel.mode === 'create'}
					<button
						type="button"
						onclick={cancelPanel}
						class="tm-btn tm-btn-secondary w-full"
						title={`Cancel ${panel.title}`}
					>
						Cancel
					</button>
				{/if}
				<button
					type="button"
					onclick={saveChanges}
					disabled={!isDirty}
					class="tm-btn tm-btn-primary w-full"
					title={`${primaryActionLabel} ${panel.title}`}
				>
					{primaryActionLabel}
				</button>
				{#if panel.submitError}
					<p
						class={panel.mode === 'create'
							? 'col-span-2 text-sm font-medium text-red-700'
							: 'text-sm font-medium text-red-700'}
					>
						{panel.submitError}
					</p>
				{/if}
			</div>
		{/if}
	</aside>
{/key}
