<script lang="ts">
	import PagesLayout from '../../../routes/pages/+layout.svelte';
	import FormGenerator from '$lib/components/form/FormGenerator.svelte';
	import type { LayoutData } from '../../../routes/pages/$types';

	interface Props {
		data: LayoutData;
	}

	let { data }: Props = $props();

	const formConfig = {
		type: 'content' as const,
		label: 'Blog post',
		content: {
			mode: 'file' as const,
			path: 'src/content/post.json'
		},
		blocks: [
			{
				id: 'sections',
				type: 'block' as const,
				label: 'Sections',
				collection: true,
				itemLabel: 'Section',
				blocks: [
					{ id: 'title', type: 'text' as const, label: 'Title' },
					{ id: 'body', type: 'textarea' as const, label: 'Body' }
				]
			}
		]
	};

	const initialData = {
		sections: [
			{
				title: 'Opening',
				body: 'Intro copy'
			}
		]
	};
</script>

<PagesLayout {data}>
	<FormGenerator config={formConfig} {initialData} />
</PagesLayout>
