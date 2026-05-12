<script lang="ts">
	interface Props {
		textareaId: string;
		value: string;
		placeholder: string;
		required: boolean;
		rows: number;
		isInvalid: boolean;
		oninputchange: (event: Event) => void;
	}

	let {
		textareaId,
		value,
		placeholder,
		required,
		rows,
		isInvalid,
		oninputchange
	}: Props = $props();
</script>

<textarea
	id={textareaId}
	{value}
	{placeholder}
	{required}
	{rows}
	oninput={oninputchange}
	class="w-full rounded-md border px-3 py-2 font-mono text-sm focus:ring-1 focus:outline-none"
	class:border-red-300={isInvalid}
	class:focus:border-red-500={isInvalid}
	class:focus:ring-red-500={isInvalid}
	class:border-gray-300={!isInvalid}
	class:focus:border-stone-900={!isInvalid}
	class:focus:ring-stone-900={!isInvalid}
></textarea>
<p class="mt-1 text-xs text-gray-500">
	Markdown is the stored source of truth. Use this tab for precise edits and alt text.
</p>
