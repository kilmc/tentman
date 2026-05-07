import prettierPluginSvelte from './apps/web/node_modules/prettier-plugin-svelte/plugin.js';
import * as prettierPluginTailwindcss from './apps/web/node_modules/prettier-plugin-tailwindcss/dist/index.mjs';

export default {
	useTabs: true,
	singleQuote: true,
	trailingComma: 'none',
	printWidth: 100,
	plugins: [prettierPluginTailwindcss, prettierPluginSvelte],
	overrides: [
		{
			files: '*.svelte',
			options: {
				parser: 'svelte'
			}
		}
	]
};
