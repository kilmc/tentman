import path from 'node:path';

const DEFAULT_COMPONENTS_DIR = 'src/lib/content-components';
const DEFAULT_WATCHED_FILES = new Set(['component.json', 'render.njk', 'preview.njk']);

/**
 * Trigger a full Vite reload when Tentman content component source files change.
 *
 * This is useful for mdsvex-backed sites where component templates live outside Vite's
 * normal module graph and therefore do not automatically invalidate compiled markdown pages.
 *
 * @param {{ componentsDir?: string }} [options]
 * @returns {import('vite').Plugin}
 */
export function tentmanContentComponentReload(options = {}) {
	const componentsDir = path.resolve(process.cwd(), options.componentsDir ?? DEFAULT_COMPONENTS_DIR);

	return {
		name: 'tentman-content-component-reload',
		apply: 'serve',
		handleHotUpdate({ file, server }) {
			const resolvedFile = path.resolve(file);

			if (
				resolvedFile !== componentsDir &&
				!resolvedFile.startsWith(`${componentsDir}${path.sep}`)
			) {
				return;
			}

			if (!DEFAULT_WATCHED_FILES.has(path.basename(resolvedFile))) {
				return;
			}

			server.ws.send({ type: 'full-reload' });
			return [];
		}
	};
}
