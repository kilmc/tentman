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
		label: 'Project',
		content: {
			mode: 'file' as const,
			path: 'src/content/project.json'
		},
		blocks: [
			{
				id: 'gallery',
				type: 'block' as const,
				label: 'Gallery',
				blocks: [
					{ id: 'layout', type: 'text' as const, label: 'Layout' },
					{
						id: 'images',
						type: 'block' as const,
						label: 'Images',
						collection: true,
						itemLabel: 'Image',
						blocks: [{ id: 'alt', type: 'text' as const, label: 'Alt text' }]
					}
				]
			}
		]
	};

	const initialData = {
		gallery: {
			layout: 'grid',
			images: [{ alt: 'Opening view' }]
		}
	};
</script>

<PagesLayout {data}>
	<FormGenerator config={formConfig} {initialData} />
</PagesLayout>
