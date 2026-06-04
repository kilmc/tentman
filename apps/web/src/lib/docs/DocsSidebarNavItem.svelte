<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import DocsSidebarNavItem from './DocsSidebarNavItem.svelte';
	import type { DocsNavItem } from './content';
	import { docsNavItemContainsHref } from './content';

	interface Props {
		item: DocsNavItem;
		currentHref: string;
		depth?: number;
	}

	let { item, currentHref, depth = 0 }: Props = $props();

	const isActive = $derived(item.href === currentHref);
	const isOpen = $derived(docsNavItemContainsHref(item, currentHref));
	const hasChildren = $derived((item.children?.length ?? 0) > 0);

	function getItemPadding(level: number): string {
		if (level <= 0) {
			return 'pl-3';
		}

		if (level === 1) {
			return 'pl-4';
		}

		return 'pl-5';
	}

	function getLeafClasses(active: boolean, level: number): string {
		const base =
			'group/item relative block rounded-xl py-2 text-sm leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40';
		const depthClass =
			level <= 0
				? 'font-medium text-stone-700 hover:bg-white hover:text-stone-950'
				: 'text-stone-600 hover:bg-white hover:text-stone-950';
		const activeClass = active
			? 'bg-white font-semibold text-stone-950 shadow-[inset_0_0_0_1px_rgba(28,25,23,0.08)]'
			: '';

		return `${base} ${getItemPadding(level)} pr-3 ${depthClass} ${activeClass}`;
	}

	function getBranchClasses(open: boolean, level: number): string {
		const base =
			'flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl py-2 text-left text-sm leading-5 transition';
		const depthClass =
			level <= 0
				? 'font-medium text-stone-700 hover:bg-white hover:text-stone-950'
				: 'text-stone-600 hover:bg-white hover:text-stone-950';
		const openClass = open
			? 'bg-white text-stone-950 shadow-[inset_0_0_0_1px_rgba(28,25,23,0.08)]'
			: '';

		return `${base} ${getItemPadding(level)} pr-3 ${depthClass} ${openClass}`;
	}
</script>

{#if hasChildren}
	<Collapsible.Root open={isOpen} class="group">
		<Collapsible.Trigger class={getBranchClasses(isOpen, depth)}>
			<span class="min-w-0 truncate">{item.title}</span>
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
			<div
				class="relative mt-1 ml-3 grid gap-1.5 border-l border-stone-200/90 pl-3 before:absolute before:top-0 before:bottom-0 before:left-0 before:w-px before:bg-gradient-to-b before:from-stone-200 before:via-stone-200 before:to-transparent before:content-['']"
			>
				{#if item.href}
					<a href={item.href} class={getLeafClasses(isActive, depth + 1)}> Overview </a>
				{/if}

				{#each item.children ?? [] as child (child.href ?? child.title)}
					<DocsSidebarNavItem item={child} {currentHref} depth={depth + 1} />
				{/each}
			</div>
		</Collapsible.Content>
	</Collapsible.Root>
{:else if item.href}
	<a href={item.href} class={getLeafClasses(isActive, depth)}>
		{item.title}
	</a>
{/if}
