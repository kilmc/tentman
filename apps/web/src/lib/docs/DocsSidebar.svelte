<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import { page } from '$app/state';
	import { docsNavigation, docsNavItemContainsHref } from './content';
	import DocsSidebarNavItem from './DocsSidebarNavItem.svelte';

	const currentHref = $derived(page.url.pathname);
</script>

<aside
	class="overflow-y-auto border-b border-stone-200 bg-white/95 px-4 py-5 backdrop-blur xl:sticky xl:top-4 xl:h-[calc(100dvh-2rem)] xl:rounded-3xl xl:border xl:border-stone-200 xl:px-5 xl:py-6 xl:shadow-[0_1px_0_rgba(28,25,23,0.03),0_18px_50px_rgba(28,25,23,0.06)]"
>
	<div class="mb-6 border-b border-stone-200 pb-4">
		<p class="text-[11px] font-semibold tracking-[0.18em] text-stone-500 uppercase">Tentman docs</p>
		<h2 class="mt-2 text-lg font-semibold tracking-tight text-stone-950">Reference and guides</h2>
		<p class="mt-2 text-sm leading-6 text-stone-600">
			Step through the guides first, then drop into exact config and type pages when you need
			detail.
		</p>
	</div>

	<nav class="grid gap-4">
		{#each docsNavigation as group (group.id)}
			{@const isGroupOpen = group.children.some((item) =>
				docsNavItemContainsHref(item, currentHref)
			)}
			<Collapsible.Root
				open={isGroupOpen}
				class="group rounded-2xl border border-stone-200 bg-stone-50/70 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]"
			>
				<Collapsible.Trigger
					class="flex w-full cursor-pointer items-center justify-between rounded-xl px-3 py-2.5 text-left text-[11px] font-semibold tracking-[0.16em] text-stone-500 uppercase transition hover:bg-white hover:text-stone-800 data-[state=open]:bg-white data-[state=open]:text-stone-800"
				>
					<span>{group.title}</span>
					<svg
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="1.5"
						class="h-4 w-4 shrink-0 text-stone-400 transition group-data-[state=open]:rotate-90"
					>
						<path d="M6 4.5L9.5 8 6 11.5" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
				</Collapsible.Trigger>

				<Collapsible.Content class="overflow-hidden">
					<div class="mt-2 grid gap-1.5">
						{#each group.children as item (item.href ?? item.title)}
							<DocsSidebarNavItem {item} {currentHref} />
						{/each}
					</div>
				</Collapsible.Content>
			</Collapsible.Root>
		{/each}
	</nav>
</aside>
