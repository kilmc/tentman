<script lang="ts">
	import { resolve } from '$app/paths';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import type { LayoutData } from './$types';

	let { children, data }: { children: import('svelte').Snippet; data: LayoutData } = $props();

	const navigation = $derived([{ href: '/', label: 'Home' }, ...(data.navigation ?? [])]);

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === href : page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="site-shell">
	<header class="site-header">
		<div class="site-header__inner">
			<a class="brand" href={resolve('/')}>
				<strong>Tentman Fixture</strong>
				<span>A small content test site</span>
			</a>

			<nav class="nav-links" aria-label="Primary">
				{#each navigation as item (item.href)}
					<a class:active={isActive(item.href)} href={item.href}>{item.label}</a>
				{/each}
			</nav>
		</div>
	</header>

	<main class="site-main">
		{@render children()}
	</main>

	<footer class="site-footer">
		<span>Simple fixture pages for checking Tentman content.</span>
		<a class="text-link" href={resolve('/blog')}>Open the blog</a>
	</footer>
</div>
