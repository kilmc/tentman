import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SERVER_ENTRYPOINT_BASENAMES = new Set(['+server.ts', '+page.server.ts', '+layout.server.ts']);

export const ALLOWED_SERVER_JUSTIFICATIONS = new Set([
	'auth_callback',
	'session',
	'github_proxy',
	'privileged_mutation',
	'image_upload',
	'hosted_extension_runtime'
]);

const APPROVED_DIRECT_OCTOKIT_PATHS = new Set([
	'src/lib/server/auth/github.ts',
	'src/lib/server/page-context.ts',
	'src/lib/repository/github.ts',
	'src/lib/config/discovery.ts',
	'src/lib/config/root-config.ts',
	'src/lib/utils/draft-comparison.ts',
	'src/lib/features/draft-publishing/service.ts'
]);

const APPROVED_DIRECT_OCTOKIT_PREFIXES = ['src/lib/github/'];

function normalizePath(value) {
	return value.split(path.sep).join('/');
}

async function walkFiles(rootDir) {
	const entries = await fs.readdir(rootDir, { withFileTypes: true });
	const files = [];

	for (const entry of entries) {
		if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.svelte-kit') {
			continue;
		}

		const entryPath = path.join(rootDir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(entryPath)));
			continue;
		}

		files.push(entryPath);
	}

	return files;
}

function isRouteServerEntrypoint(relativePath) {
	return (
		relativePath.startsWith('src/routes/') &&
		SERVER_ENTRYPOINT_BASENAMES.has(path.basename(relativePath))
	);
}

function isRouteCodeFile(relativePath) {
	return (
		relativePath.startsWith('src/routes/') &&
		!relativePath.endsWith('.spec.ts') &&
		/\.(ts|js|svelte)$/.test(relativePath)
	);
}

function isApprovedDirectOctokitPath(relativePath) {
	if (isRouteServerEntrypoint(relativePath)) {
		return true;
	}

	if (APPROVED_DIRECT_OCTOKIT_PATHS.has(relativePath)) {
		return true;
	}

	return APPROVED_DIRECT_OCTOKIT_PREFIXES.some((prefix) => relativePath.startsWith(prefix));
}

function findServerJustificationHeader(text) {
	const firstLines = text.split('\n').slice(0, 5).join('\n');
	return firstLines.match(/^\s*\/\/\s*SERVER_JUSTIFICATION:\s*([a-z_]+)\s*$/m);
}

export async function checkThinBackend({ rootDir = process.cwd() } = {}) {
	const absoluteRoot = path.resolve(rootDir);
	const files = await walkFiles(absoluteRoot);
	const issues = [];

	for (const absolutePath of files) {
		const relativePath = normalizePath(path.relative(absoluteRoot, absolutePath));
		if (relativePath.startsWith('src/') === false) {
			continue;
		}

		if (relativePath.endsWith('.spec.ts') || relativePath.endsWith('.d.ts')) {
			continue;
		}

		const text = await fs.readFile(absolutePath, 'utf8');

		if (isRouteServerEntrypoint(relativePath)) {
			const match = findServerJustificationHeader(text);
			if (!match) {
				issues.push(
					`${relativePath}: missing SERVER_JUSTIFICATION header on route server entrypoint`
				);
			} else if (!ALLOWED_SERVER_JUSTIFICATIONS.has(match[1])) {
				issues.push(
					`${relativePath}: invalid SERVER_JUSTIFICATION "${match[1]}"`
				);
			}

			if (
				(relativePath.endsWith('+page.server.ts') || relativePath.endsWith('+layout.server.ts')) &&
				/export\s+(const\s+load|async\s+function\s+load)\b/.test(text)
			) {
				issues.push(
					`${relativePath}: route-server load exports are forbidden; use a thin /api read plus +page.ts or +layout.ts instead`
				);
			}

			continue;
		}

		if (isRouteCodeFile(relativePath)) {
			if (/['"]\$lib\/server\//.test(text)) {
				issues.push(
					`${relativePath}: route code must not import $lib/server/*; move server work behind a thin endpoint`
				);
			}
		}

		if (!isApprovedDirectOctokitPath(relativePath)) {
			if (
				/\bnew\s+Octokit\s*\(/.test(text) ||
				/\boctokit\.rest\b/.test(text) ||
				/\bcreateGitHubServerClient\s*\(/.test(text) ||
				/import\s+(?!type\b)[^;]*from\s+['"]octokit['"]/.test(text)
			) {
				issues.push(
					`${relativePath}: direct Octokit usage escaped the approved thin-backend server layer`
				);
			}
		}
	}

	return issues.sort();
}

async function main() {
	const issues = await checkThinBackend();

	if (issues.length === 0) {
		console.log('Thin backend guardrails passed.');
		return;
	}

	console.error('Thin backend guardrails failed:');
	for (const issue of issues) {
		console.error(`- ${issue}`);
	}

	process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	await main();
}

export const INTERNALS = {
	findServerJustificationHeader,
	isApprovedDirectOctokitPath,
	isRouteCodeFile,
	isRouteServerEntrypoint,
	normalizePath
};
