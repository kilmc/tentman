import { getMarkdownFieldValidationState } from '$lib/components/form/markdown-field-validation';
import { collectContentComponentReferenceState } from '$lib/content-components/references';
import type { ContentComponentRegistry } from '$lib/content-components/registry';
import type { FormContentContext } from '$lib/components/form/form-content-context';
import type { RootConfig } from '$lib/config/root-config';

export interface MarkdownFieldReferenceState {
	referenceIndex: Map<string, Map<string, unknown>>;
	optionsByBinding: Map<string, Array<{ label: string; value: string }>>;
	errors?: string[];
}

export function collectMarkdownFieldReferenceState(
	formContentContext: FormContentContext | null
): MarkdownFieldReferenceState | null {
	if (!formContentContext) {
		return null;
	}

	const rootBlocks = formContentContext.getRootBlocks();
	const rootData = formContentContext.getRootData();
	if (!rootBlocks.length || !rootData) {
		return null;
	}

	return collectContentComponentReferenceState({
		blocks: rootBlocks,
		contentItem: rootData,
		blockRegistry: formContentContext.getBlockRegistry()
	});
}

export function getMarkdownFieldReferenceOptions(
	formContentContext: FormContentContext | null,
	binding: string
): Array<{ label: string; value: string }> {
	return collectMarkdownFieldReferenceState(formContentContext)?.optionsByBinding.get(binding) ?? [];
}

export function getMarkdownFieldActiveRootConfig(options: {
	testRootConfig?: RootConfig | null;
	selectedBackendKind?: string;
	localRootConfig?: RootConfig | null;
	pageRootConfig?: RootConfig | null;
}): RootConfig | null {
	if (options.testRootConfig !== undefined) {
		return options.testRootConfig;
	}

	return options.selectedBackendKind === 'local'
		? (options.localRootConfig ?? null)
		: (options.pageRootConfig ?? null);
}

export function getMarkdownFieldComponentMode(options: {
	testComponentMode?: 'local' | 'github';
	selectedBackendKind?: string;
}): 'local' | 'github' {
	return options.testComponentMode ?? (options.selectedBackendKind === 'local' ? 'local' : 'github');
}

export function getMarkdownFieldComponentsDir(rootConfig: RootConfig | null | undefined): string | undefined {
	return rootConfig?.componentsDir;
}

export function getMarkdownFieldValidationMode(
	rootConfig: RootConfig | null | undefined
): 'permissive' | 'strict' {
	return rootConfig?.validation?.contentComponents === 'strict' ? 'strict' : 'permissive';
}

export function getMarkdownFieldContentItem(
	formContentContext: FormContentContext | null
): object | null {
	return formContentContext?.getRootData() ?? null;
}

export function resolveMarkdownFieldComponentEnvironment(options: {
	testRootConfig?: RootConfig | null;
	testComponentMode?: 'local' | 'github';
	testLoadRegistry?: (
		mode: 'local' | 'github',
		options?: { scopeKey?: string; componentsDir?: string }
	) => Promise<ContentComponentRegistry>;
	defaultLoadRegistry: (
		mode: 'local' | 'github',
		options?: { scopeKey?: string; componentsDir?: string }
	) => Promise<ContentComponentRegistry>;
	selectedBackendKind?: string;
	localRootConfig?: RootConfig | null;
	pageRootConfig?: RootConfig | null;
	repoKey: string | null | undefined;
}): {
	loadRegistry: (
		mode: 'local' | 'github',
		options?: { scopeKey?: string; componentsDir?: string }
	) => Promise<ContentComponentRegistry>;
	componentMode: 'local' | 'github';
	componentsDir?: string;
	scopeKey: string;
} {
	const rootConfig = getMarkdownFieldActiveRootConfig({
		testRootConfig: options.testRootConfig,
		selectedBackendKind: options.selectedBackendKind,
		localRootConfig: options.localRootConfig,
		pageRootConfig: options.pageRootConfig
	});
	const componentMode = getMarkdownFieldComponentMode({
		testComponentMode: options.testComponentMode,
		selectedBackendKind: options.selectedBackendKind
	});

	return {
		loadRegistry: options.testLoadRegistry ?? options.defaultLoadRegistry,
		componentMode,
		componentsDir: getMarkdownFieldComponentsDir(rootConfig),
		scopeKey: options.repoKey ?? componentMode
	};
}

export function getMarkdownFieldValidationResult(options: {
	formContentContext: FormContentContext | null;
	markdown: string;
	enabledComponentNames?: string[];
	availableRegistry: ContentComponentRegistry;
	enabledRegistry: ContentComponentRegistry;
	validationMode?: 'permissive' | 'strict';
}) {
	const referenceState = collectMarkdownFieldReferenceState(options.formContentContext);
	const errors = getMarkdownFieldValidationState({
		markdown: options.markdown,
		enabledComponentNames: options.enabledComponentNames,
		availableRegistry: options.availableRegistry,
		enabledRegistry: options.enabledRegistry,
		referenceIndex: referenceState?.referenceIndex,
		referenceErrors: referenceState?.errors
	});
	const validationMode = options.validationMode ?? 'permissive';

	return {
		allErrors: errors.errors,
		blockingErrors: validationMode === 'strict' ? errors.errors : [],
		message: errors.message
	};
}

export function getNextMarkdownFieldValidationState(options: {
	formContentContext: FormContentContext | null;
	markdown: string;
	enabledComponentNames?: string[];
	availableRegistry: ContentComponentRegistry | null;
	enabledRegistry: ContentComponentRegistry | null;
	lastValidationErrorsKey: string;
	validationMode?: 'permissive' | 'strict';
}): {
	componentLoadError: string | null;
	lastValidationErrorsKey: string;
	validationErrorsToEmit: string[] | null;
} {
	if (!options.availableRegistry || !options.enabledRegistry) {
		return {
			componentLoadError: null,
			lastValidationErrorsKey: '',
			validationErrorsToEmit:
				options.lastValidationErrorsKey !== '' ? [] : null
		};
	}

	const validationState = getMarkdownFieldValidationResult({
		formContentContext: options.formContentContext,
		markdown: options.markdown,
		enabledComponentNames: options.enabledComponentNames,
		availableRegistry: options.availableRegistry,
		enabledRegistry: options.enabledRegistry,
		validationMode: options.validationMode
	});
	const nextValidationErrorsKey = validationState.blockingErrors.join('\u0000');

	return {
		componentLoadError: validationState.message,
		lastValidationErrorsKey: nextValidationErrorsKey,
		validationErrorsToEmit:
			nextValidationErrorsKey !== options.lastValidationErrorsKey
				? validationState.blockingErrors
				: null
	};
}
