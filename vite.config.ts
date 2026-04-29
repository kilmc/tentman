import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

const includeBrowserProject = process.env.VITEST_BROWSER === '1';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	optimizeDeps: {
		include: [
			'lucide-svelte/icons/more-horizontal',
			'lucide-svelte/icons/pencil',
			'lucide-svelte/icons/sidebar-close',
			'lucide-svelte/icons/sidebar-open'
		]
	},
	test: {
		expect: { requireAssertions: true },
		projects: [
			...(includeBrowserProject
				? [
						{
							extends: './vite.config.ts',
							test: {
								name: 'client',
								environment: 'browser',
								browser: {
									enabled: true,
									provider: 'playwright',
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
				extends: './vite.config.ts',
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
