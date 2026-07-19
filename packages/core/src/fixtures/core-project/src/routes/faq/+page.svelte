<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>FAQ | Tentman Test App</title>
</svelte:head>

<section class="page-header">
	<p class="eyebrow">Nested collection</p>
	<h1>{data.faq.title}</h1>
	<p class="lead">{data.faq.intro}</p>
</section>

<section class="prose">
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{@html data.faqHtml}
</section>

<section class="faq-list">
	{#each data.renderedSections as section (section.title)}
		<article class="faq-section">
			<p class="eyebrow">Section</p>
			<h2>{section.title}</h2>
			{#if section.intro}
				<p>{section.intro}</p>
			{/if}

			<div class="faq-question-list">
				{#each section.questions as question (question.question)}
					<section class="faq-question">
						<h3>{question.question}</h3>
						<div class="prose">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html question.answerHtml}
						</div>
					</section>
				{/each}
			</div>
		</article>
	{/each}
</section>
