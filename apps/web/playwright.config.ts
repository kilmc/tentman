import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_WEB_PORT ?? '4173');
const host = process.env.PLAYWRIGHT_WEB_HOST ?? '127.0.0.1';
const baseURL = `http://${host}:${port}`;

export default defineConfig({
	testDir: './tests/playwright',
	fullyParallel: false,
	retries: process.env.CI ? 2 : 0,
	use: {
		baseURL,
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	webServer: {
		command: `corepack pnpm exec vite dev --host ${host} --port ${port}`,
		url: baseURL,
		reuseExistingServer: !process.env.CI
	}
});
