<script lang="ts">
	interface Props {
		label: string;
		value: string;
		required?: boolean;
		placeholder?: string;
		rows?: number;
		oninput?: (value: string) => void;
	}

	let {
		label,
		value = $bindable(''),
		required = false,
		placeholder = '',
		rows = 12,
		oninput
	}: Props = $props();

	let activeTab = $state<'edit' | 'preview'>('edit');

	function handleInput(event: Event) {
		const target = event.target as HTMLTextAreaElement;
		value = target.value;
		oninput?.(value);
	}

	// Simple markdown to HTML conversion for preview
	// This is a basic implementation - a real app might use marked.js or similar
	function markdownToHtml(md: string): string {
		if (!md) return '<p class="text-gray-400 italic">Nothing to preview</p>';

		let html = md;

		// Headers
		html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
		html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-4 mb-2">$1</h2>');
		html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-4 mb-3">$1</h1>');

		// Bold
		html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');

		// Italic
		html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');

		// Links
		html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-blue-600 hover:underline">$1</a>');

		// Code blocks
		html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre class="bg-gray-100 rounded p-3 my-2 overflow-x-auto"><code class="text-sm font-mono">$2</code></pre>');

		// Inline code
		html = html.replace(/`([^`]+)`/g, '<code class="bg-gray-100 px-1 rounded text-sm font-mono">$1</code>');

		// Lists
		html = html.replace(/^\* (.*$)/gim, '<li class="ml-4">$1</li>');
		html = html.replace(/(<li.*<\/li>)/s, '<ul class="list-disc my-2">$1</ul>');

		// Line breaks
		html = html.replace(/\n\n/g, '</p><p class="mb-2">');
		html = `<p class="mb-2">${html}</p>`;

		return html;
	}
</script>

<div class="mb-4">
	<label class="mb-1 block text-sm font-medium text-gray-700">
		{label}
		{#if required}
			<span class="text-red-600">*</span>
		{/if}
	</label>

	<!-- Tab buttons -->
	<div class="flex border-b border-gray-300 mb-2">
		<button
			type="button"
			onclick={() => activeTab = 'edit'}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'edit' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'}"
		>
			Edit
		</button>
		<button
			type="button"
			onclick={() => activeTab = 'preview'}
			class="px-4 py-2 text-sm font-medium border-b-2 transition-colors {activeTab === 'preview' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900'}"
		>
			Preview
		</button>
	</div>

	<!-- Edit tab -->
	{#if activeTab === 'edit'}
		<textarea
			{value}
			{placeholder}
			{required}
			{rows}
			oninput={handleInput}
			class="w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
		></textarea>
		<p class="mt-1 text-xs text-gray-500">Supports Markdown formatting</p>
	{/if}

	<!-- Preview tab -->
	{#if activeTab === 'preview'}
		<div class="w-full min-h-[200px] rounded border border-gray-300 px-3 py-2 bg-gray-50">
			<div class="prose max-w-none">
				{@html markdownToHtml(value)}
			</div>
		</div>
		<p class="mt-1 text-xs text-gray-500">Markdown preview (basic rendering)</p>
	{/if}
</div>
