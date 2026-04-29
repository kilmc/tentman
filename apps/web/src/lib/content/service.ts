import type { ParsedContentConfig } from '$lib/config/parse';
import type { ContentDocument, ContentRecord } from '$lib/features/content-management/types';
import type { RepositoryBackend } from '$lib/repository/types';
import { directoryContentAdapter } from './adapters/directory';
import { fileContentAdapter } from './adapters/file';
import type {
	ChangesSummary,
	ContentCreateOptions,
	ContentDeleteOptions,
	ContentFetchOptions,
	ContentPreviewOptions,
	ContentSaveOptions
} from './adapters/types';

function createContext(
	backend: RepositoryBackend,
	config: ParsedContentConfig,
	configPath: string
) {
	return {
		backend,
		config,
		configPath
	};
}

export async function fetchContentDocument(
	backend: RepositoryBackend,
	config: ParsedContentConfig,
	configPath: string,
	options?: ContentFetchOptions
): Promise<ContentDocument> {
	switch (config.content.mode) {
		case 'file':
			return fileContentAdapter.fetch(createContext(backend, config, configPath), options);
		case 'directory':
			return directoryContentAdapter.fetch(createContext(backend, config, configPath), options);
	}
}

export async function saveContentDocument(
	backend: RepositoryBackend,
	config: ParsedContentConfig,
	configPath: string,
	data: ContentRecord,
	options?: ContentSaveOptions
): Promise<void> {
	switch (config.content.mode) {
		case 'file':
			return fileContentAdapter.save(createContext(backend, config, configPath), data, options);
		case 'directory':
			return directoryContentAdapter.save(
				createContext(backend, config, configPath),
				data,
				options
			);
	}
}

export async function createContentDocument(
	backend: RepositoryBackend,
	config: ParsedContentConfig,
	configPath: string,
	data: ContentRecord,
	options?: ContentCreateOptions
): Promise<void> {
	switch (config.content.mode) {
		case 'file':
			return fileContentAdapter.create!(createContext(backend, config, configPath), data, options);
		case 'directory':
			return directoryContentAdapter.create!(
				createContext(backend, config, configPath),
				data,
				options
			);
	}
}

export async function deleteContentDocument(
	backend: RepositoryBackend,
	config: ParsedContentConfig,
	configPath: string,
	options: ContentDeleteOptions
): Promise<void> {
	switch (config.content.mode) {
		case 'file':
			return fileContentAdapter.delete!(createContext(backend, config, configPath), options);
		case 'directory':
			return directoryContentAdapter.delete!(createContext(backend, config, configPath), options);
	}
}

export async function previewContentChanges(
	backend: RepositoryBackend,
	config: ParsedContentConfig,
	configPath: string,
	data: ContentRecord,
	options?: ContentPreviewOptions
): Promise<ChangesSummary> {
	switch (config.content.mode) {
		case 'file':
			return fileContentAdapter.preview!(createContext(backend, config, configPath), data, options);
		case 'directory':
			return directoryContentAdapter.preview!(
				createContext(backend, config, configPath),
				data,
				options
			);
	}
}
