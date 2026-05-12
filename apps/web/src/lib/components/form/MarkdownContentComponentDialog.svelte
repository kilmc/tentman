<script lang="ts">
	import { tick } from 'svelte';
	import { getContentComponentDialogFieldOptions } from '$lib/content-components/dialog';
	import type { MarkdownToolbarDialogContribution } from '$lib/features/markdown-editor/types';

	interface Props {
		dialog: MarkdownToolbarDialogContribution;
		title: string;
		submitLabel: string;
		values: Record<string, string>;
		serializedValue?: string | null;
		validationError?: string | null;
		onclose: () => void;
		onsubmit: () => void;
		onvaluechange: (fieldId: string, value: string) => void;
	}

	let {
		dialog,
		title,
		submitLabel,
		values,
		serializedValue = null,
		validationError = null,
		onclose,
		onsubmit,
		onvaluechange
	}: Props = $props();

	let form = $state<HTMLFormElement | null>(null);

	$effect(() => {
		void tick().then(() => {
			form
				?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
					'input, select, textarea'
				)
				?.focus();
		});
	});
</script>

<div
	class="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/35 p-4"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) {
			onclose();
		}
	}}
>
	<div
		class="w-full max-w-md rounded-lg border border-stone-200 bg-white p-5 shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="markdown-component-dialog-title"
	>
		<form
			bind:this={form}
			onsubmit={(event) => {
				event.preventDefault();
				onsubmit();
			}}
		>
			<div class="mb-4 flex items-start justify-between gap-4">
				<h2 id="markdown-component-dialog-title" class="text-base font-semibold text-stone-950">
					{title}
				</h2>
				<button
					type="button"
					class="rounded-md px-2 py-1 text-sm font-medium text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
					aria-label="Close"
					onclick={onclose}
				>
					Close
				</button>
			</div>

			<div class="space-y-4">
				{#each dialog.fields as field (field.id)}
					<label class="block text-sm font-medium text-stone-700">
						<span class="mb-1 block">
							{field.label}
							{#if field.required}
								<span class="text-red-600">*</span>
							{/if}
						</span>

						{#if field.type === 'select'}
							<select
								class="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
								value={values[field.id] ?? ''}
								required={field.required}
								onchange={(event) => onvaluechange(field.id, event.currentTarget.value)}
							>
								{#if !values[field.id]}
									<option value="">Select {field.label.toLowerCase()}</option>
								{/if}
								{#each getContentComponentDialogFieldOptions(field, values) as option (option.value)}
									<option value={option.value}>{option.label}</option>
								{/each}
							</select>
						{:else}
							<input
								class="w-full rounded-md border border-stone-300 px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-stone-900 focus:ring-1 focus:ring-stone-900 focus:outline-none"
								type={field.type === 'url' ? 'url' : 'text'}
								value={values[field.id] ?? ''}
								required={field.required}
								oninput={(event) => onvaluechange(field.id, event.currentTarget.value)}
							/>
						{/if}
					</label>
				{/each}
			</div>

			{#if serializedValue}
				<div class="mt-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-3">
					<p class="text-xs font-medium tracking-wide text-stone-500 uppercase">
						Markdown marker
					</p>
					<code class="mt-2 block whitespace-pre-wrap break-all font-mono text-xs text-stone-900">
						{serializedValue}
					</code>
				</div>
			{/if}

			{#if validationError}
				<div class="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
					{validationError}
				</div>
			{/if}

			<div class="mt-5 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-medium text-stone-700 shadow-sm hover:bg-stone-50 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none"
					onclick={onclose}
				>
					Cancel
				</button>
				<button
					type="submit"
					class="rounded-md border border-stone-950 bg-stone-950 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-stone-800 focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-stone-300 disabled:bg-stone-300 disabled:text-stone-100 disabled:shadow-none"
					disabled={Boolean(validationError)}
				>
					{submitLabel}
				</button>
			</div>
		</form>
	</div>
</div>
