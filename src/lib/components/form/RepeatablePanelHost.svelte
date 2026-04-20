<script lang="ts">
	import { getContext, hasContext } from 'svelte';
	import type { RepeatableWorkspacePanel } from '$lib/features/forms/workspace-panel';
	import {
		FORM_WORKSPACE_PANEL,
		type FormWorkspacePanelContext
	} from '$lib/features/forms/workspace-panel';
	import type { ContentValue } from '$lib/features/content-management/types';
	import RepeatablePanelField from './RepeatablePanelField.svelte';

	interface Props {
		panel: RepeatableWorkspacePanel;
		framed?: boolean;
	}

	let { panel, framed = true }: Props = $props();
	const workspacePanel = hasContext(FORM_WORKSPACE_PANEL)
		? getContext<FormWorkspacePanelContext>(FORM_WORKSPACE_PANEL)
		: null;

	const isDirty = $derived(panel.isDirty);
	const primaryActionLabel = $derived(panel.mode === 'create' ? 'Add' : 'Save');

	function getPanelKey(panel: RepeatableWorkspacePanel): string {
		return [panel.id, panel.mode, panel.selectedIndex, panel.title].join(':');
	}

	function handleFieldChange(blockId: string, value: ContentValue | undefined) {
		workspacePanel?.session?.updatePanelField(blockId, value);
	}

	function saveChanges() {
		if (!isDirty || !workspacePanel?.session) {
			return;
		}

		workspacePanel.session.commitPanel();
	}

	function closePanel() {
		workspacePanel?.session?.closePanel();
	}

	function removeItem() {
		workspacePanel?.session?.removePanelItem();
	}
</script>

{#key getPanelKey(panel)}
	<aside
		class="grid h-full max-h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white"
		class:rounded-md={framed}
		class:border={framed}
		class:border-stone-200={framed}
		aria-label={`${panel.label} editor`}
	>
		<div class="grid gap-3 border-b border-stone-200 px-4 py-4">
			<button
				type="button"
				onclick={closePanel}
				class="inline-flex w-fit items-center gap-1 text-xs font-semibold text-stone-500 transition-colors hover:text-stone-950"
				title={`Back to ${panel.listLabel}`}
			>
				<svg
					class="h-3.5 w-3.5"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					aria-hidden="true"
				>
					<path d="m15 18-6-6 6-6" />
				</svg>
				Back to {panel.listLabel}
			</button>

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
				<span class="h-2 w-2 rounded-full bg-stone-950" aria-hidden="true"></span>
			</div>
		</div>

		<div class="min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
			<div class="grid gap-2">
				{#each panel.blocks as block (block.id)}
					<RepeatablePanelField
						{panel}
						{block}
						item={panel.selectedItem}
						onfieldchange={handleFieldChange}
					/>
				{/each}
			</div>
		</div>

		<div
			class={panel.mode === 'create'
				? 'grid grid-cols-1 gap-2 border-t border-stone-200 px-4 py-4'
				: 'grid grid-cols-2 gap-2 border-t border-stone-200 px-4 py-4'}
		>
			<button
				type="button"
				onclick={saveChanges}
				disabled={!isDirty}
				class="tm-btn tm-btn-primary w-full"
				title={`${primaryActionLabel} ${panel.title}`}
			>
				{primaryActionLabel}
			</button>
			{#if panel.mode === 'edit'}
				<button
					type="button"
					onclick={removeItem}
					class="tm-btn w-full border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
					aria-label={`Remove ${panel.title}`}
					title={`Remove ${panel.title}`}
				>
					Remove
				</button>
			{/if}
			{#if panel.submitError}
				<p
					class={panel.mode === 'create'
						? 'text-sm font-medium text-red-700'
						: 'col-span-2 text-sm font-medium text-red-700'}
				>
					{panel.submitError}
				</p>
			{/if}
		</div>
	</aside>
{/key}
