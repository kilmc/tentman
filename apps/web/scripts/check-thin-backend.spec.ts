import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { checkThinBackend } from './check-thin-backend.mjs';

const fixturesDir = fileURLToPath(new URL('./fixtures/thin-backend', import.meta.url));

describe('check-thin-backend', () => {
	it('passes for a justified thin-backend fixture', async () => {
		await expect(
			checkThinBackend({
				rootDir: path.join(fixturesDir, 'pass')
			})
		).resolves.toEqual([]);
	});

	it('catches a missing justification header fixture', async () => {
		await expect(
			checkThinBackend({
				rootDir: path.join(fixturesDir, 'missing-justification')
			})
		).resolves.toContain(
			'src/routes/api/example/+server.ts: missing SERVER_JUSTIFICATION header on route server entrypoint'
		);
	});

	it('catches a forbidden page server load fixture', async () => {
		await expect(
			checkThinBackend({
				rootDir: path.join(fixturesDir, 'page-server-load')
			})
		).resolves.toContain(
			'src/routes/pages/demo/+page.server.ts: route-server load exports are forbidden; use a thin /api read plus +page.ts or +layout.ts instead'
		);
	});

	it('catches a route server import leak fixture', async () => {
		await expect(
			checkThinBackend({
				rootDir: path.join(fixturesDir, 'server-import-leak')
			})
		).resolves.toContain(
			'src/routes/pages/demo/+page.ts: route code must not import $lib/server/*; move server work behind a thin endpoint'
		);
	});
});
