import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

const includeBrowserProject = process.env.VITEST_BROWSER === '1';

export default defineConfig({
	plugins: [
		{
			name: 'tentman-nunjucks-browser-shim',
			resolveId(source, _importer, options) {
				if (source === 'nunjucks' && !options?.ssr) {
					return path.resolve('./src/lib/test-support/nunjucks-browser-shim.ts');
				}

				return null;
			}
		},
		tailwindcss(),
		sveltekit()
	],
	optimizeDeps: {
		noDiscovery: true,
		include: [
			'@humanspeak/svelte-markdown',
			'@tiptap/core',
			'@tiptap/extension-file-handler',
			'@tiptap/extension-image',
			'@tiptap/extension-placeholder',
			'@tiptap/markdown',
			'@tiptap/starter-kit',
			'bits-ui',
			'gray-matter',
			'jsonpath-plus',
			'lucide-svelte/icons/arrow-down-a-z',
			'lucide-svelte/icons/arrow-up-a-z',
			'lucide-svelte/icons/check',
			'lucide-svelte/icons/chevron-down',
			'lucide-svelte/icons/chevron-left',
			'lucide-svelte/icons/chevron-right',
			'lucide-svelte/icons/external-link',
			'lucide-svelte/icons/grip-vertical',
			'lucide-svelte/icons/log-out',
			'lucide-svelte/icons/more-horizontal',
			'lucide-svelte/icons/navigation',
			'lucide-svelte/icons/panel-left-open',
			'lucide-svelte/icons/pencil',
			'lucide-svelte/icons/plus',
			'lucide-svelte/icons/refresh-cw',
			'lucide-svelte/icons/settings',
			'lucide-svelte/icons/sidebar-close',
			'lucide-svelte/icons/sidebar-open',
			'lucide-svelte/icons/trash-2',
			'lucide-svelte/icons/upload-cloud',
			'lucide-svelte/icons/x',
			'svelte-dnd-action'
		]
	},
	test: {
		api: includeBrowserProject
			? {
					host: '127.0.0.1',
					port: 0
				}
			: undefined,
		expect: { requireAssertions: true },
		isolate: true,
		projects: [
			...(includeBrowserProject
				? [
						{
							extends: true as const,
							test: {
								name: 'client',
								environment: 'browser',
								isolate: true,
								browser: {
									enabled: true,
									provider: 'playwright',
									api: {
										host: '127.0.0.1',
										port: 0
									},
									headless: true,
									instances: [{ browser: 'chromium' }]
								},
								include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
								exclude: ['src/lib/server/**'],
								setupFiles: ['./vitest-setup-client.ts']
							}
						}
					]
				: []),
			{
				extends: true as const,
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'scripts/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
