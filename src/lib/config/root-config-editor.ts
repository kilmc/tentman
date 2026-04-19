import type { RepositoryBackend, RepositoryWriteOptions } from '$lib/repository/types';

const ROOT_CONFIG_PATH = '.tentman.json';
const DEFAULT_PREVIEW_BASE_URL = 'http://localhost';

type JsonObject = Record<string, unknown>;

function assertJsonObject(value: unknown): JsonObject {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error('Root config must be a JSON object.');
	}

	return value as JsonObject;
}

async function readRootConfigSource(backend: RepositoryBackend): Promise<JsonObject> {
	if (!(await backend.fileExists(ROOT_CONFIG_PATH))) {
		return {};
	}

	const content = await backend.readTextFile(ROOT_CONFIG_PATH);
	if (content.trim().length === 0) {
		return {};
	}

	return assertJsonObject(JSON.parse(content) as unknown);
}

function getPreviewBase(currentPreviewUrl?: string | null): URL {
	if (!currentPreviewUrl) {
		return new URL(DEFAULT_PREVIEW_BASE_URL);
	}

	try {
		return new URL(currentPreviewUrl);
	} catch {
		return new URL(DEFAULT_PREVIEW_BASE_URL);
	}
}

export function getPreviewPortFromUrl(previewUrl?: string | null): string {
	if (!previewUrl) {
		return '';
	}

	try {
		const url = new URL(previewUrl);
		if (url.port) {
			return url.port;
		}

		return url.protocol === 'https:' ? '443' : '80';
	} catch {
		return '';
	}
}

export function buildLocalPreviewUrlFromPort(
	portValue: string,
	currentPreviewUrl?: string | null
): string {
	const normalizedPort = portValue.trim();
	const port = Number(normalizedPort);

	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error('Enter a port between 1 and 65535.');
	}

	const url = getPreviewBase(currentPreviewUrl);
	url.port = normalizedPort;

	return url.toString();
}

export async function writeLocalPreviewUrl(
	backend: RepositoryBackend,
	previewUrl: string,
	options?: RepositoryWriteOptions
): Promise<void> {
	const source = await readRootConfigSource(backend);
	const currentLocal = source.local && typeof source.local === 'object' ? source.local : {};
	const nextSource = {
		...source,
		local: {
			...(currentLocal as JsonObject),
			previewUrl
		}
	};

	await backend.writeTextFile(
		ROOT_CONFIG_PATH,
		`${JSON.stringify(nextSource, null, 2)}\n`,
		options
	);
}
