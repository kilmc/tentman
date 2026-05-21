<script lang="ts">
	import type { DocsPage } from './content';

	interface Props {
		doc: DocsPage;
	}

	let { doc }: Props = $props();

	const codeLikeColumns = new Set([
		'Field',
		'Type',
		'Mode',
		'Export',
		'Required fields',
		'Optional fields'
	]);

	const compactColumns = new Set(['Required']);

	function getColumnClass(column: string): string {
		switch (column) {
			case 'Field':
			case 'Export':
				return 'w-[14rem]';
			case 'Required':
				return 'w-[7rem]';
			case 'Type':
				return 'w-[20rem]';
			case 'Mode':
				return 'w-[11rem]';
			case 'Required fields':
			case 'Optional fields':
				return 'w-[16rem]';
			case 'Use for':
			case 'Purpose':
				return 'w-[18rem]';
			case 'Notes':
				return 'w-[22rem]';
			default:
				return 'w-auto';
		}
	}

	function getCellClass(column: string): string {
		if (compactColumns.has(column)) {
			return 'text-xs font-medium uppercase tracking-[0.08em] text-stone-500';
		}

		if (codeLikeColumns.has(column)) {
			return 'font-mono text-[12px] leading-6 text-stone-800 whitespace-pre-wrap break-words';
		}

		return 'text-[13.5px] leading-6 text-stone-700';
	}
</script>

<div class="mx-auto w-full max-w-[72rem]">
	<header class="border-b border-stone-200 pb-8">
		<p class="text-sm font-medium capitalize text-stone-500">{doc.section.replace('-', ' ')}</p>
		<h1 class="mt-2 text-4xl font-semibold tracking-tight text-stone-950">{doc.title}</h1>
		<p class="mt-4 max-w-4xl text-[17px] leading-8 text-stone-700">{doc.description}</p>
		{#if doc.intro}
			<p class="mt-3 max-w-4xl text-sm leading-6 text-stone-600">{doc.intro}</p>
		{/if}
	</header>

	{#each doc.sections as section (section.id)}
		<section
			id={section.id}
			class="scroll-mt-24 border-t border-stone-200 py-8 first:border-t-0 first:pt-8"
		>
			<div class="max-w-4xl">
				<h2 class="text-2xl font-semibold tracking-tight text-stone-950">{section.title}</h2>
				{#if section.description}
					<p class="mt-3 text-sm leading-6 text-stone-600">{section.description}</p>
				{/if}
			</div>

			<div class="mt-5 space-y-5">
				{#each section.blocks as block, index (`${section.id}:${index}`)}
					{#if block.kind === 'rich-text'}
						<div
							class="docs-rich-text max-w-4xl space-y-4 text-base leading-7 text-stone-700 [&_a]:font-medium [&_code]:text-[13px] [&_ol]:space-y-2 [&_p]:m-0 [&_ul]:space-y-2"
						>
							{@html block.html}
						</div>
					{:else if block.kind === 'table'}
						<div class="overflow-x-auto rounded-3xl border border-stone-200 bg-white shadow-sm">
							<table class="min-w-[62rem] w-full table-fixed divide-y divide-stone-200 text-sm">
								<thead class="bg-stone-50/90 text-left text-stone-700">
									<tr>
										{#each block.table.columns as column}
											<th class={`px-4 py-3.5 align-bottom text-xs font-semibold tracking-[0.08em] text-stone-600 uppercase ${getColumnClass(column)}`}>
												{column}
											</th>
										{/each}
									</tr>
								</thead>
								<tbody class="divide-y divide-stone-200 bg-white">
									{#each block.table.rows as row}
										<tr class="align-top odd:bg-white even:bg-stone-50/35">
											{#each row as cell, cellIndex}
												<td class={`px-4 py-3.5 align-top ${getColumnClass(block.table.columns[cellIndex])}`}>
													<div class={getCellClass(block.table.columns[cellIndex])}>
														{cell}
													</div>
												</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{:else if block.kind === 'code'}
						<div class="space-y-3">
							{#if block.title || block.description}
								<div class="max-w-4xl">
									{#if block.title}
										<h3 class="text-lg font-semibold text-stone-950">{block.title}</h3>
									{/if}
									{#if block.description}
										<p class="mt-2 text-sm leading-6 text-stone-600">{block.description}</p>
									{/if}
								</div>
							{/if}
							<div
								class="overflow-x-auto rounded-2xl border border-stone-200 bg-stone-950 shadow-sm"
							>
								<pre class="p-4 text-sm leading-6 text-stone-100"><code>{block.code}</code></pre>
							</div>
						</div>
					{:else if block.kind === 'code-grid'}
						<div class="grid gap-5 lg:grid-cols-2">
							{#each block.items as item}
								<div class="space-y-3">
									{#if item.title || item.description}
										<div>
											{#if item.title}
												<h3 class="text-lg font-semibold text-stone-950">{item.title}</h3>
											{/if}
											{#if item.description}
												<p class="mt-2 text-sm leading-6 text-stone-600">{item.description}</p>
											{/if}
										</div>
									{/if}
									<div
										class="overflow-x-auto rounded-2xl border border-stone-200 bg-stone-950 shadow-sm"
									>
										<pre class="p-4 text-sm leading-6 text-stone-100"><code>{item.code}</code></pre>
									</div>
								</div>
							{/each}
						</div>
					{:else if block.kind === 'link-list'}
						<div class="max-w-4xl rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
							{#if block.title}
								<h3 class="text-lg font-semibold text-stone-950">{block.title}</h3>
							{/if}
							<ul class="mt-3 grid gap-3">
								{#each block.links as link}
									<li>
										<a
											href={link.href}
											class="block rounded-xl border border-stone-200 px-4 py-3 transition hover:border-stone-300 hover:bg-stone-50"
										>
											<div class="font-medium text-stone-950">{link.label}</div>
											{#if link.description}
												<div class="mt-1 text-sm text-stone-600">{link.description}</div>
											{/if}
										</a>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				{/each}
			</div>
		</section>
	{/each}

	{#if doc.related && doc.related.length > 0}
		<section class="border-t border-stone-200 py-8">
			<h2 class="text-xl font-semibold text-stone-950">Related</h2>
			<div class="mt-4 grid gap-3 md:grid-cols-2">
				{#each doc.related as link}
					<a
						href={link.href}
						class="rounded-2xl border border-stone-200 bg-white px-4 py-4 shadow-sm transition hover:border-stone-300 hover:bg-stone-50"
					>
						<div class="font-medium text-stone-950">{link.label}</div>
						{#if link.description}
							<div class="mt-1 text-sm text-stone-600">{link.description}</div>
						{/if}
					</a>
				{/each}
			</div>
		</section>
	{/if}
</div>
