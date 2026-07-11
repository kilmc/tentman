<script lang="ts">
	import { resolve } from '$app/paths';

	let { data } = $props();

	const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'long' });
</script>

<svelte:head>
	<title>{data.post.title} | Tentman Test App</title>
</svelte:head>

<article class="article-layout">
	<header class="page-header">
		<p class="eyebrow">Blog post</p>
		<h1>{data.post.title}</h1>
		<p class="lead">{data.post.excerpt}</p>
		<p class="post-meta">
			{dateFormatter.format(new Date(data.post.date))} · {data.post.author} · {data.post
				.readingTimeMinutes}
			min read
		</p>
	</header>

	<div class="prose">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -->
		{@html data.bodyHtml}
	</div>

	<a class="text-link" href={resolve('/blog')}>Back to the blog</a>
</article>
