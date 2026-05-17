import { mdsvex } from 'mdsvex';
import adapter from '@sveltejs/adapter-auto';
import remarkDirective from 'remark-directive';
import { tentmanComponents } from '@tentman/mdsvex';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter()
	},
	vitePlugin: {
		dynamicCompileOptions: ({ filename }) =>
			filename.includes('node_modules') ? undefined : { runes: true }
	},
	preprocess: [
		mdsvex({
			extensions: ['.svx', '.md'],
			remarkPlugins: [
				remarkDirective,
				tentmanComponents({
					projectRoot: process.cwd(),
					resolveTentmanContext: 'auto'
				})
			]
		})
	],
	extensions: ['.svelte', '.svx', '.md']
};

export default config;
